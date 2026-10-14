import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseLimit } from '../common/utils/pagination';
import { DeploymentComparisonQueryDto } from './dto/deployment-comparison-query.dto';

interface DashboardAnalyticsRow {
  metric: 'workflowRuns' | 'deployments';
  day: Date;
  successes: number;
  failures: number;
}

export interface DashboardAnalyticsPoint {
  date: string;
  successes: number;
  failures: number;
}

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

  async compareProjectEnvironments(projectId: string, organizationId: string, query: DeploymentComparisonQueryDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Project not found.');
    if (query.leftEnvironmentId === query.rightEnvironmentId) {
      throw new BadRequestException('Choose two different environments.');
    }

    const environments = await this.prisma.environment.findMany({
      where: {
        projectId,
        id: { in: [query.leftEnvironmentId, query.rightEnvironmentId] },
      },
      select: { id: true, name: true, isProduction: true },
    });
    if (environments.length !== 2) {
      throw new BadRequestException('Both environments must belong to this project.');
    }

    const byId = new Map(environments.map((environment) => [environment.id, environment]));
    const leftEnvironment = byId.get(query.leftEnvironmentId);
    const rightEnvironment = byId.get(query.rightEnvironmentId);
    if (!leftEnvironment || !rightEnvironment) {
      throw new BadRequestException('Both environments must belong to this project.');
    }
    const [leftDeployment, rightDeployment] = await Promise.all([
      this.prisma.deployment.findFirst({
        where: { projectId, environmentId: query.leftEnvironmentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { workflowRun: { select: { workflowName: true, runNumber: true, htmlUrl: true } } },
      }),
      this.prisma.deployment.findFirst({
        where: { projectId, environmentId: query.rightEnvironmentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { workflowRun: { select: { workflowName: true, runNumber: true, htmlUrl: true } } },
      }),
    ]);
    const left = {
      environment: leftEnvironment,
      deployment: leftDeployment,
    };
    const right = {
      environment: rightEnvironment,
      deployment: rightDeployment,
    };

    return {
      data: {
        project,
        left,
        right,
        sameCommit: leftDeployment && rightDeployment ? leftDeployment.commitSha === rightDeployment.commitSha : null,
      },
    };
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

    const count = <K extends string>(
      rows: Array<Record<K, unknown> & { _count: { _all: number } }>,
      key: K,
      value: string,
    ) => rows.find((r) => r[key] === value)?._count._all ?? 0;

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

  async getDashboardAnalytics(organizationId: string, days = 30) {
    const end = new Date();
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - days + 1));

    const rows = await this.prisma.$queryRaw<DashboardAnalyticsRow[]>(Prisma.sql`
      SELECT
        'workflowRuns' AS metric,
        (wr.created_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*) FILTER (WHERE wr.conclusion = 'SUCCESS')::int AS successes,
        COUNT(*) FILTER (WHERE wr.conclusion = 'FAILURE')::int AS failures
      FROM workflow_runs wr
      INNER JOIN repositories r ON r.id = wr.repository_id
      INNER JOIN projects p ON p.id = r.project_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND wr.created_at >= ${start}
        AND wr.created_at < ${end}
        AND wr.conclusion IN ('SUCCESS', 'FAILURE')
      GROUP BY day

      UNION ALL

      SELECT
        'deployments' AS metric,
        (d.created_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*) FILTER (WHERE d.status = 'SUCCESS')::int AS successes,
        COUNT(*) FILTER (WHERE d.status = 'FAILURE')::int AS failures
      FROM deployments d
      INNER JOIN projects p ON p.id = d.project_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND d.created_at >= ${start}
        AND d.created_at < ${end}
        AND d.status IN ('SUCCESS', 'FAILURE')
      GROUP BY day
    `);

    const byMetric: Record<DashboardAnalyticsRow['metric'], Map<string, { successes: number; failures: number }>> = {
      workflowRuns: new Map(),
      deployments: new Map(),
    };
    for (const row of rows) {
      byMetric[row.metric].set(row.day.toISOString().slice(0, 10), {
        successes: row.successes,
        failures: row.failures,
      });
    }

    const workflowRuns: DashboardAnalyticsPoint[] = [];
    const deployments: DashboardAnalyticsPoint[] = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      workflowRuns.push({
        date,
        ...(byMetric.workflowRuns.get(date) ?? { successes: 0, failures: 0 }),
      });
      deployments.push({
        date,
        ...(byMetric.deployments.get(date) ?? { successes: 0, failures: 0 }),
      });
    }

    return { data: { periodDays: days, workflowRuns, deployments } };
  }
}
