import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IncidentEventType, IncidentStatus } from '@prisma/client';
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

  async findOne(id: string, organizationId: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, service: { project: { organizationId } } },
      include: {
        service: {
          select: { id: true, name: true, healthUrl: true, project: { select: { id: true, name: true } } },
        },
        events: {
          include: { actorUser: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found.');
    return { data: incident };
  }

  async acknowledge(id: string, organizationId: string, userId: string) {
    return this.transition(id, organizationId, userId, 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'Incident acknowledged.');
  }

  async resolve(id: string, organizationId: string, userId: string, message?: string) {
    return this.transition(id, organizationId, userId, 'RESOLVED', 'RESOLVED', message ?? 'Incident resolved.');
  }

  private async transition(
    id: string,
    organizationId: string,
    userId: string,
    status: IncidentStatus,
    eventType: IncidentEventType,
    message: string,
  ) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, service: { project: { organizationId } } },
    });
    if (!existing) throw new NotFoundException('Incident not found.');
    if (existing.status === 'RESOLVED') {
      throw new ConflictException('Incident is already resolved.');
    }

    // Status change, timeline event and audit record must succeed or fail together.
    const incident = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id },
        data: { status, ...(status === 'RESOLVED' && { resolvedAt: new Date() }) },
      });
      await tx.incidentEvent.create({
        data: { incidentId: id, eventType, message, actorUserId: userId },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'UPDATE',
          resourceType: 'incident',
          resourceId: id,
          metadata: { from: existing.status, to: status, message },
        },
      });
      return updated;
    });

    return { data: incident };
  }

  async getEvents(incidentId: string, organizationId: string) {
    await this.findOne(incidentId, organizationId);
    const events = await this.prisma.incidentEvent.findMany({
      where: { incidentId },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { data: events };
  }
}
