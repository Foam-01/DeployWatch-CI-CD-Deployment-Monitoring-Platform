import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { SecretBox } from '../common/crypto/secret-box';
import { PrismaService } from '../common/prisma/prisma.service';
import { maskUrl, parseChannelConfig, readStoredConfig } from './channel-config';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';
import { NotificationDispatcherService } from './notification-dispatcher.service';

interface Actor {
  userId: string;
  role: string;
}

/** Channel management and delivery history (owners and admins); in-app feed (everyone). */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  // ── Channels ───────────────────────────────────────────────

  async findChannels(organizationId: string, actor: Actor) {
    this.assertAdmin(actor);
    const channels = await this.prisma.notificationChannel.findMany({
      where: { organizationId, type: { in: ['SLACK', 'WEBHOOK'] } },
      include: { _count: { select: { deliveries: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { data: channels.map((c) => this.toPublic(c)) };
  }

  async createChannel(organizationId: string, actor: Actor, dto: CreateChannelDto) {
    this.assertAdmin(actor);
    const config = parseChannelConfig(dto.type, dto.url);
    const channel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notificationChannel.create({
        data: {
          organizationId,
          createdById: actor.userId,
          name: dto.name.trim(),
          type: dto.type,
          events: dto.events ?? [],
          configEncrypted: this.secrets.encrypt(JSON.stringify(config)),
        },
      });
      await this.audit(tx, organizationId, actor, 'CREATE', created.id, { name: created.name, type: created.type });
      return created;
    });
    return { data: this.toPublic(channel) };
  }

  async updateChannel(organizationId: string, actor: Actor, id: string, dto: UpdateChannelDto) {
    this.assertAdmin(actor);
    const existing = await this.findChannelInOrg(organizationId, id);
    const data: Prisma.NotificationChannelUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.events !== undefined && { events: dto.events }),
      ...(dto.url !== undefined && {
        configEncrypted: this.secrets.encrypt(JSON.stringify(parseChannelConfig(existing.type, dto.url))),
      }),
    };
    const channel = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationChannel.update({ where: { id }, data });
      await this.audit(tx, organizationId, actor, 'UPDATE', id, {
        changed: Object.keys(dto).filter((k) => k !== 'url').concat(dto.url ? ['destination'] : []),
      });
      return updated;
    });
    return { data: this.toPublic(channel) };
  }

  async deleteChannel(organizationId: string, actor: Actor, id: string) {
    this.assertAdmin(actor);
    const existing = await this.findChannelInOrg(organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationChannel.delete({ where: { id } });
      await this.audit(tx, organizationId, actor, 'DELETE', id, { name: existing.name, type: existing.type });
    });
    return { data: { id } };
  }

  /** Queues a real message through the normal pipeline and sends it right away. */
  async sendTest(organizationId: string, actor: Actor, id: string) {
    this.assertAdmin(actor);
    const channel = await this.findChannelInOrg(organizationId, id);
    const eventKey = `test:${channel.id}:${Date.now()}`;
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        channelId: channel.id,
        idempotencyKey: `${channel.id}:${eventKey}`,
        eventKey,
        status: 'PENDING',
        payload: {
          organizationId,
          type: 'INCIDENT_RESOLVED',
          eventKey,
          title: `Test notification for ${channel.name}`,
          body: 'If you can read this, DeployWatch can reach this channel.',
          link: '/settings/notifications',
        },
      },
    });
    await this.dispatcher.dispatchNow(delivery.id);
    const result = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    return { data: { id: result.id, status: result.status, errorMsg: result.errorMsg } };
  }

  async findDeliveries(organizationId: string, actor: Actor, opts: { limit: number; cursor?: string; status?: string }) {
    this.assertAdmin(actor);
    const status = ['PENDING', 'SENT', 'FAILED'].includes(opts.status ?? '') ? (opts.status as 'SENT') : undefined;
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { channel: { organizationId }, ...(status && { status }) },
      select: {
        id: true,
        eventKey: true,
        status: true,
        attemptCount: true,
        lastAttemptAt: true,
        nextAttemptAt: true,
        sentAt: true,
        errorMsg: true,
        createdAt: true,
        payload: true,
        channel: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > opts.limit;
    const items = (hasMore ? rows.slice(0, opts.limit) : rows).map(({ payload, ...row }) => ({
      ...row,
      title: (payload as { title?: string })?.title ?? row.eventKey,
    }));
    return {
      data: items,
      meta: { pagination: { limit: opts.limit, hasMore, cursor: hasMore ? items[items.length - 1].id : undefined } },
    };
  }

  // ── In-app feed ────────────────────────────────────────────

  async findForUser(organizationId: string, userId: string, opts: { limit: number; cursor?: string; unread?: boolean }) {
    const rows = await this.prisma.notification.findMany({
      where: {
        organizationId,
        ...(opts.unread && { reads: { none: { userId } } }),
      },
      include: { reads: { where: { userId }, select: { readAt: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > opts.limit;
    const items = (hasMore ? rows.slice(0, opts.limit) : rows).map(({ reads, ...n }) => ({
      ...n,
      readAt: reads[0]?.readAt ?? null,
    }));
    return {
      data: items,
      meta: { pagination: { limit: opts.limit, hasMore, cursor: hasMore ? items[items.length - 1].id : undefined } },
    };
  }

  async unreadCount(organizationId: string, userId: string) {
    const count = await this.prisma.notification.count({
      where: { organizationId, reads: { none: { userId } } },
    });
    return { data: { count } };
  }

  async markRead(organizationId: string, userId: string, ids: string[] | 'all') {
    const targets = await this.prisma.notification.findMany({
      where: {
        organizationId,
        reads: { none: { userId } },
        ...(ids !== 'all' && { id: { in: ids } }),
      },
      select: { id: true },
    });
    await this.prisma.notificationRead.createMany({
      data: targets.map((t) => ({ notificationId: t.id, userId })),
      skipDuplicates: true,
    });
    return { data: { marked: targets.length } };
  }

  // ── helpers ────────────────────────────────────────────────

  private toPublic(c: NotificationChannel & { _count?: { deliveries: number } }) {
    let destination = '…';
    try {
      destination = maskUrl(readStoredConfig(this.secrets.decrypt(c.configEncrypted)).url);
    } catch {
      // Unreadable config (e.g. legacy row): show nothing rather than fail the list.
    }
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      events: c.events,
      enabled: c.enabled,
      destination,
      createdAt: c.createdAt,
      deliveryCount: c._count?.deliveries,
    };
  }

  private assertAdmin(actor: Actor) {
    if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only owners and admins can manage notification channels.');
    }
  }

  private async findChannelInOrg(organizationId: string, id: string) {
    const channel = await this.prisma.notificationChannel.findFirst({ where: { id, organizationId } });
    if (!channel) throw new NotFoundException('Notification channel not found.');
    return channel;
  }

  private audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actor: Actor,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    resourceId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: { organizationId, actorUserId: actor.userId, action, resourceType: 'notification_channel', resourceId, metadata },
    });
  }
}
