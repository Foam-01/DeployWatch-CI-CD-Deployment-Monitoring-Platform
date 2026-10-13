import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, status?: string) {
    const where: any = {
      service: { project: { organizationId } },
    };
    if (status) where.status = status;

    const incidents = await this.prisma.incident.findMany({
      where,
      include: {
        service: {
          select: { name: true, project: { select: { name: true, id: true } } },
        },
        _count: { select: { events: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });

    return { data: incidents };
  }

  async findOne(id: string) {
    const incident = await this.prisma.incident.findUniqueOrThrow({
      where: { id },
      include: {
        service: { select: { name: true, healthUrl: true } },
        events: {
          include: { actorUser: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return { data: incident };
  }

  async acknowledge(id: string, userId: string) {
    return this.transition(id, 'ACKNOWLEDGED', 'ACKNOWLEDGED', userId, 'Incident acknowledged.');
  }

  async resolve(id: string, userId: string, message?: string) {
    const incident = await this.prisma.incident.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });

    await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: 'RESOLVED',
        message: message ?? 'Incident resolved.',
        actorUserId: userId,
      },
    });

    return { data: incident };
  }

  private async transition(
    id: string,
    status: any,
    eventType: any,
    userId: string,
    message: string,
  ) {
    const incident = await this.prisma.incident.update({
      where: { id },
      data: { status },
    });

    await this.prisma.incidentEvent.create({
      data: { incidentId: id, eventType, message, actorUserId: userId },
    });

    return { data: incident };
  }

  async getEvents(incidentId: string) {
    const events = await this.prisma.incidentEvent.findMany({
      where: { incidentId },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { data: events };
  }
}
