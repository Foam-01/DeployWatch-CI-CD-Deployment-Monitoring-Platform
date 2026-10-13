import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string, organizationId: string, query: any = {}) {
    const { limit = 20, cursor, environmentId, status } = query;

    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) return { data: [] };

    const where: any = { projectId };
    if (environmentId) where.environmentId = environmentId;
    if (status) where.status = status;

    const deployments = await this.prisma.deployment.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        environment: { select: { name: true, isProduction: true } },
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

  async findOne(id: string) {
    const deployment = await this.prisma.deployment.findUniqueOrThrow({
      where: { id },
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

    const [
      totalProjects,
      successfulRuns,
      failedRuns,
      totalDeployments,
      successfulDeployments,
      healthyServices,
      degradedServices,
      downServices,
      openIncidents,
      recentRuns,
      recentDeployments,
    ] = await Promise.all([
      this.prisma.project.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.workflowRun.count({
        where: {
          repository: { project: { organizationId } },
          conclusion: 'SUCCESS',
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.workflowRun.count({
        where: {
          repository: { project: { organizationId } },
          conclusion: 'FAILURE',
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.deployment.count({
        where: {
          project: { organizationId },
          status: { in: ['SUCCESS', 'FAILURE'] },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.deployment.count({
        where: {
          project: { organizationId },
          status: 'SUCCESS',
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.service.count({ where: { project: { organizationId }, currentStatus: 'HEALTHY' } }),
      this.prisma.service.count({ where: { project: { organizationId }, currentStatus: 'DEGRADED' } }),
      this.prisma.service.count({ where: { project: { organizationId }, currentStatus: 'DOWN' } }),
      this.prisma.incident.count({
        where: { service: { project: { organizationId } }, status: { not: 'RESOLVED' } },
      }),
      this.prisma.workflowRun.findMany({
        where: { repository: { project: { organizationId } } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          repository: { select: { project: { select: { name: true } } } },
        },
      }),
      this.prisma.deployment.findMany({
        where: { project: { organizationId } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          environment: { select: { name: true } },
          project: { select: { name: true } },
        },
      }),
    ]);

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
