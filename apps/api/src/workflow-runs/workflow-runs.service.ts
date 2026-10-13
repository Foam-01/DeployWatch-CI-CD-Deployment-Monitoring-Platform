import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class WorkflowRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: any) {
    const { projectId, status, conclusion, branch, limit = 20, cursor } = query;

    const where: any = {
      repository: { project: { organizationId } },
    };

    if (projectId) where.repository = { ...where.repository, projectId };
    if (status) where.status = status;
    if (conclusion) where.conclusion = conclusion;
    if (branch) where.branch = branch;

    const runs = await this.prisma.workflowRun.findMany({
      where,
      take: (limit ?? 20) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        repository: {
          select: { fullName: true, project: { select: { id: true, name: true } } },
        },
      },
    });

    const parsedLimit = limit ?? 20;
    const hasMore = runs.length > parsedLimit;
    const items = hasMore ? runs.slice(0, parsedLimit) : runs;

    // Compute duration
    const itemsWithDuration = items.map((run) => ({
      ...run,
      durationSeconds:
        run.startedAt && run.completedAt
          ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
          : null,
    }));

    return {
      data: itemsWithDuration,
      meta: {
        pagination: {
          limit: parsedLimit,
          hasMore,
          cursor: hasMore ? items[items.length - 1].id : undefined,
        },
      },
    };
  }

  async findOne(id: string) {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id },
      include: {
        repository: {
          select: { fullName: true, project: { select: { id: true, name: true } } },
        },
        deployments: true,
      },
    });

    return {
      data: {
        ...run,
        durationSeconds:
          run.startedAt && run.completedAt
            ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
            : null,
      },
    };
  }

  async findByProject(projectId: string, organizationId: string, query: any) {
    return this.findAll(organizationId, { ...query, projectId });
  }
}
