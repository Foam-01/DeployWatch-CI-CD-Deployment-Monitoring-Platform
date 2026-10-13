import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationChannelType, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findChannels(organizationId: string) {
    return this.prisma.notificationChannel.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { deliveries: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createChannel(data: {
    organizationId: string;
    name: string;
    type: NotificationChannelType;
    configEncrypted: string;
    createdById?: string;
  }) {
    return this.prisma.notificationChannel.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        type: data.type,
        configEncrypted: data.configEncrypted,
        createdById: data.createdById,
        enabled: true,
      },
    });
  }

  async updateChannel(id: string, data: { name?: string; enabled?: boolean; configEncrypted?: string }) {
    const channel = await this.prisma.notificationChannel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');

    return this.prisma.notificationChannel.update({
      where: { id },
      data,
    });
  }

  async deleteChannel(id: string) {
    return this.prisma.notificationChannel.delete({ where: { id } });
  }

  async findDeliveries(organizationId: string, limit = 50) {
    return this.prisma.notificationDelivery.findMany({
      where: {
        channel: { organizationId },
      },
      include: {
        channel: {
          select: { name: true, type: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async sendTestNotification(channelId: string) {
    const channel = await this.prisma.notificationChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        channelId,
        idempotencyKey: 'test-' + Date.now(),
        eventKey: 'TEST_EVENT',
        payload: { message: 'This is a test notification from DeployWatch', timestamp: new Date() },
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        attemptCount: 1,
      },
    });

    return { success: true, deliveryId: delivery.id, message: 'Test notification sent successfully' };
  }
}
