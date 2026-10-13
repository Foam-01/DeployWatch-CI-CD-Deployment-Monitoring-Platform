import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PUBLIC_REPOSITORY_SELECT } from '../repositories/repositories.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: ProjectQueryDto) {
    const { status, limit = 20, cursor } = query;

    const where: any = { organizationId };
    if (status) where.status = status;

    const projects = await this.prisma.project.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        repositories: { select: { id: true, fullName: true, provider: true } },
        environments: { select: { id: true, name: true, isProduction: true } },
        _count: {
          select: { deployments: true },
        },
      },
    });

    const hasMore = projects.length > limit;
    const items = hasMore ? projects.slice(0, limit) : projects;

    return {
      data: items,
      meta: {
        pagination: {
          limit,
          hasMore,
          cursor: hasMore ? items[items.length - 1].id : undefined,
        },
      },
    };
  }

  async findOne(id: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: {
        repositories: { select: PUBLIC_REPOSITORY_SELECT },
        environments: true,
        services: {
          include: { _count: { select: { healthChecks: true, incidents: true } } },
        },
        alertRules: true,
        _count: {
          select: { deployments: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return { data: project };
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    const slug = this.generateSlug(dto.name);

    const project = await this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
        description: dto.description,
      },
    });

    // Create default environments
    await this.prisma.environment.createMany({
      data: [
        { projectId: project.id, name: 'Development', slug: 'development', isProduction: false },
        { projectId: project.id, name: 'Staging', slug: 'staging', isProduction: false },
        { projectId: project.id, name: 'Production', slug: 'production', isProduction: true },
      ],
    });

    return { data: project };
  }

  async update(id: string, organizationId: string, dto: UpdateProjectDto) {
    await this.findOne(id, organizationId);

    const project = await this.prisma.project.update({
      where: { id },
      data: dto,
    });

    return { data: project };
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const project = await this.prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return { data: project };
  }

  async getMetrics(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalRuns, successfulRuns, failedRuns, totalDeployments, successfulDeployments, openIncidents] =
      await Promise.all([
        this.prisma.workflowRun.count({
          where: {
            repository: { projectId: id },
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.workflowRun.count({
          where: {
            repository: { projectId: id },
            conclusion: 'SUCCESS',
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.workflowRun.count({
          where: {
            repository: { projectId: id },
            conclusion: 'FAILURE',
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.deployment.count({
          where: {
            projectId: id,
            status: { in: ['SUCCESS', 'FAILURE'] },
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.deployment.count({
          where: {
            projectId: id,
            status: 'SUCCESS',
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.incident.count({
          where: {
            service: { projectId: id },
            status: { not: 'RESOLVED' },
          },
        }),
      ]);

    const deploymentSuccessRate =
      totalDeployments > 0 ? Math.round((successfulDeployments / totalDeployments) * 100) : null;

    return {
      data: {
        period: '30d',
        workflowRuns: { total: totalRuns, successful: successfulRuns, failed: failedRuns },
        deployments: {
          total: totalDeployments,
          successful: successfulDeployments,
          successRate: deploymentSuccessRate,
        },
        openIncidents,
      },
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }
}
