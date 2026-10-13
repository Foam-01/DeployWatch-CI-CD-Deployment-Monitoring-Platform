import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    organizationId?: string;
    actorUserId?: string;
    action: AuditAction;
    resourceType: string;
    resourceId?: string;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: data.organizationId,
        actorUserId: data.actorUserId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        metadata: data.metadata || {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async findByOrganization(
    organizationId: string,
    { limit, cursor, resourceType }: { limit: number; cursor?: string; resourceType?: string },
  ) {
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId, ...(resourceType && { resourceType }) },
      include: { actorUser: { select: { id: true, email: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const hasMore = logs.length > limit;
    const items = hasMore ? logs.slice(0, limit) : logs;
    return {
      data: items,
      meta: { pagination: { limit, hasMore, cursor: hasMore ? items[items.length - 1].id : undefined } },
    };
  }
}
