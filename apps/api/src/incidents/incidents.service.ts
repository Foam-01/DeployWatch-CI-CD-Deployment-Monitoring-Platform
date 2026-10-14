import { Injectable, NotFoundException, ConflictException, PayloadTooLargeException } from '@nestjs/common';
import { IncidentEventType, IncidentSeverity, IncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotifierService } from '../notifications/notifier.service';
import { CSV_EXPORT_MAX_ROWS, toCsv } from '../common/utils/csv';
import { IncidentExportQueryDto } from './dto/incident-export-query.dto';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: NotifierService,
  ) {}

  async findAll(organizationId: string, status?: IncidentStatus, severity?: IncidentSeverity) {
    const where: Prisma.IncidentWhereInput = {
      service: { project: { organizationId } },
    };
    if (status) where.status = status;
    if (severity) where.severity = severity;

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

  async exportCsv(organizationId: string, query: IncidentExportQueryDto): Promise<string> {
    const where: Prisma.IncidentWhereInput = {
      service: { project: { organizationId } },
      ...(query.status && { status: query.status }),
      ...(query.severity && { severity: query.severity }),
    };
    const incidents = await this.prisma.incident.findMany({
      where,
      take: CSV_EXPORT_MAX_ROWS + 1,
      orderBy: { openedAt: 'desc' },
      include: {
        service: {
          select: { name: true, project: { select: { name: true } } },
        },
      },
    });

    if (incidents.length > CSV_EXPORT_MAX_ROWS) {
      throw new PayloadTooLargeException(
        `CSV export is limited to ${CSV_EXPORT_MAX_ROWS} rows. Apply filters and try again.`,
      );
    }

    return toCsv(
      ['id', 'title', 'description', 'status', 'severity', 'project', 'service', 'opened_at', 'resolved_at'],
      incidents.map((incident) => [
        incident.id,
        incident.title,
        incident.description,
        incident.status,
        incident.severity,
        incident.service?.project.name,
        incident.service?.name,
        incident.openedAt.toISOString(),
        incident.resolvedAt?.toISOString(),
      ]),
    );
  }

  async findOne(id: string, organizationId: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, service: { project: { organizationId } } },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            healthUrl: true,
            project: { select: { id: true, name: true } },
          },
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
        data: {
          status,
          ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
        },
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

    if (status === 'RESOLVED') {
      await this.notifier.emitSafely({
        organizationId,
        type: 'INCIDENT_RESOLVED',
        eventKey: `incident_resolved:${id}`,
        title: `Resolved: ${incident.title}`,
        body: message,
        link: `/incidents/${id}`,
      });
    }

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
