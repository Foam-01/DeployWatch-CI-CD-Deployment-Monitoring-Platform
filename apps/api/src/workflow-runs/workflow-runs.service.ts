import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseLimit } from '../common/utils/pagination';
import { CSV_EXPORT_MAX_ROWS, toCsv } from '../common/utils/csv';
import { WorkflowRunExportQueryDto } from './dto/workflow-run-export-query.dto';

@Injectable()
export class WorkflowRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: any) {
    const { projectId, status, conclusion, branch, cursor } = query;
    const parsedLimit = parseLimit(query.limit);

    const where: any = {
      repository: { project: { organizationId } },
    };

    if (projectId) where.repository = { ...where.repository, projectId };
    if (status) where.status = status;
    if (conclusion) where.conclusion = conclusion;
    if (branch) where.branch = branch;

    const runs = await this.prisma.workflowRun.findMany({
      where,
      take: parsedLimit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        repository: {
          select: {
            fullName: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

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

  async findOne(id: string, organizationId: string) {
    const run = await this.prisma.workflowRun.findFirstOrThrow({
      where: { id, repository: { project: { organizationId } } },
      include: {
        repository: {
          select: {
            fullName: true,
            project: { select: { id: true, name: true } },
          },
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

  async exportCsv(organizationId: string, query: WorkflowRunExportQueryDto): Promise<string> {
    const where: Prisma.WorkflowRunWhereInput = {
      repository: { project: { organizationId } },
    };

    if (query.projectId) {
      where.repository = { project: { organizationId, id: query.projectId } };
    }
    if (query.status) where.status = query.status;
    if (query.conclusion) where.conclusion = query.conclusion;
    if (query.branch !== undefined) where.branch = query.branch;

    const runs = await this.prisma.workflowRun.findMany({
      where,
      take: CSV_EXPORT_MAX_ROWS + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        repository: {
          select: { fullName: true, project: { select: { name: true } } },
        },
      },
    });

    if (runs.length > CSV_EXPORT_MAX_ROWS) {
      throw new PayloadTooLargeException(
        `CSV export is limited to ${CSV_EXPORT_MAX_ROWS} rows. Apply filters and try again.`,
      );
    }

    return toCsv(
      [
        'id',
        'project',
        'repository',
        'workflow',
        'run_number',
        'status',
        'conclusion',
        'branch',
        'commit_sha',
        'commit_message',
        'event',
        'triggered_by',
        'duration_seconds',
        'started_at',
        'completed_at',
        'url',
      ],
      runs.map((run) => [
        run.id,
        run.repository.project.name,
        run.repository.fullName,
        run.workflowName,
        run.runNumber,
        run.status,
        run.conclusion,
        run.branch,
        run.commitSha,
        run.commitMessage,
        run.eventType,
        run.triggeredBy,
        run.startedAt && run.completedAt
          ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
          : null,
        run.startedAt?.toISOString(),
        run.completedAt?.toISOString(),
        run.htmlUrl,
      ]),
    );
  }
}
