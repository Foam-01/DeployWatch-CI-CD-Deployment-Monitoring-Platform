import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseLimit } from '../common/utils/pagination';

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string, organizationId: string, query: any = {}) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) throw new NotFoundException('Project not found.');
    return this.findAll(organizationId, { ...query, projectId });
  }

  async findAll(organizationId: string, query: any = {}) {
    const { cursor, environmentId, status, projectId } = query;
    const limit = parseLimit(query.limit);

    const where: any = { project: { organizationId } };
    if (projectId) where.projectId = projectId;
    if (environmentId) where.environmentId = environmentId;
    if (status) where.status = status;

    const deployments = await this.prisma.deployment.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        environment: { select: { name: true, isProduction: true } },
        project: { select: { id: true, name: true } },
        workflowRun: { select: { workflowName: true, runNumber: true, htmlUrl: true } },
      },
    });

    const hasMore = deployments.length > limit;
    const items = hasMore ? deployments.slice(0, limit) : deployments;

    return {
      data: items,
      meta: { pagination: { limit, hasMore, cursor: hasMore ? items[items.length - 1].id : undefined } },
    };
  }

  async findOne(id: string, organizationId: string) {
    const deployment = await this.prisma.deployment.findFirstOrThrow({
      where: { id, project: { organizationId } },
      include: {
        environment: true,
        project: { select: { name: true, id: true } },
        workflowRun: true,
      },
    });
    return { data: deployment };
  }

  async getDashboardOverview(organizationId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Counts are grouped (3 queries instead of 7) because every query is a network
    // round trip to the database.
    const [totalProjects, runCounts, deploymentCounts, serviceCounts, openIncidents, recentRuns, recentDeployments] =
      await Promise.all([
        this.prisma.project.count({ where: { organizationId, status: 'ACTIVE' } }),
        this.prisma.workflowRun.groupBy({
          by: ['conclusion'],
          where: {
            repository: { project: { organizationId } },
            conclusion: { in: ['SUCCESS', 'FAILURE'] },
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { _all: true },
        }),
        this.prisma.deployment.groupBy({
          by: ['status'],
          where: {
            project: { organizationId },
            status: { in: ['SUCCESS', 'FAILURE'] },
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { _all: true },
        }),
        this.prisma.service.groupBy({
          by: ['currentStatus'],
          where: { project: { organizationId } },
          _count: { _all: true },
        }),
        this.prisma.incident.count({
          where: { service: { project: { organizationId } }, status: { not: 'RESOLVED' } },
        }),
        this.prisma.workflowRun.findMany({
          where: { repository: { project: { organizationId } } },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { repository: { select: { project: { select: { name: true } } } } },
        }),
        this.prisma.deployment.findMany({
          where: { project: { organizationId } },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { environment: { select: { name: true } }, project: { select: { name: true } } },
        }),
      ]);

    const count = <K extends string>(rows: Array<Record<K, unknown> & { _count: { _all: number } }>, key: K, value: string) =>
      rows.find((r) => r[key] === value)?._count._all ?? 0;

    const successfulRuns = count(runCounts, 'conclusion', 'SUCCESS');
    const failedRuns = count(runCounts, 'conclusion', 'FAILURE');
    const successfulDeployments = count(deploymentCounts, 'status', 'SUCCESS');
    const totalDeployments = successfulDeployments + count(deploymentCounts, 'status', 'FAILURE');
    const healthyServices = count(serviceCounts, 'currentStatus', 'HEALTHY');
    const degradedServices = count(serviceCounts, 'currentStatus', 'DEGRADED');
    const downServices = count(serviceCounts, 'currentStatus', 'DOWN');

    const deploymentSuccessRate =
      totalDeployments > 0 ? Math.round((successfulDeployments / totalDeployments) * 100) : null;

    return {
      data: {
        summary: {
          totalProjects,
          successfulRuns,
          failedRuns,
          deploymentSuccessRate,
          services: { healthy: healthyServices, degraded: degradedServices, down: downServices },
          openIncidents,
        },
        recentRuns,
        recentDeployments,
      },
    };
  }
}
