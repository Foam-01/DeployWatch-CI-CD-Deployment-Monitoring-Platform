import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationEvent } from './notification-events';

/**
 * Records a domain event as an in-app notification and queues one delivery per
 * matching outbound channel. Sending happens later in NotificationDispatcher, so the
 * caller (webhook processing, health checks, incident actions) never waits on Slack.
 *
 * Idempotent: the same eventKey creates at most one notification and one delivery per
 * channel, so a retried webhook or a re-run health check cannot notify twice.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(private readonly prisma: PrismaService) {}

  async emit(event: NotificationEvent): Promise<void> {
    await this.prisma.notification.createMany({
      data: [
        {
          organizationId: event.organizationId,
          eventKey: event.eventKey,
          eventType: event.type,
          title: event.title.slice(0, 200),
          body: event.body?.slice(0, 1000),
          link: event.link,
        },
      ],
      skipDuplicates: true,
    });

    const channels = await this.prisma.notificationChannel.findMany({
      where: { organizationId: event.organizationId, enabled: true, type: { in: ['SLACK', 'WEBHOOK'] } },
      select: { id: true, events: true },
    });
    const targets = channels.filter((c) => c.events.length === 0 || c.events.includes(event.type));
    if (targets.length === 0) return;

    await this.prisma.notificationDelivery.createMany({
      data: targets.map((c) => ({
        channelId: c.id,
        idempotencyKey: `${c.id}:${event.eventKey}`,
        eventKey: event.eventKey,
        payload: event as unknown as Prisma.InputJsonValue,
        status: 'PENDING' as const,
      })),
      skipDuplicates: true,
    });
    this.logger.debug(`Queued ${targets.length} delivery(ies) for ${event.eventKey}`);
  }

  /** Notifications must never break the operation that triggered them. */
  async emitSafely(event: NotificationEvent): Promise<void> {
    try {
      await this.emit(event);
    } catch (err) {
      this.logger.error(`Failed to record notification ${event.eventKey}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
