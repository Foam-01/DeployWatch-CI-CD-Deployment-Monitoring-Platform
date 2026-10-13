import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RepositoryProvider } from '@prisma/client';
import { CreateRepositoryDto } from './dto/create-repository.dto';

/** Columns safe to return to clients — never includes webhook secrets or tokens. */
export const PUBLIC_REPOSITORY_SELECT = {
  id: true,
  projectId: true,
  provider: true,
  externalRepoId: true,
  fullName: true,
  defaultBranch: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RepositoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProjectInOrg(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) throw new NotFoundException('Project not found.');
  }

  async findByProject(projectId: string, organizationId: string) {
    await this.assertProjectInOrg(projectId, organizationId);
    const repos = await this.prisma.repository.findMany({
      where: { projectId },
      select: { ...PUBLIC_REPOSITORY_SELECT, _count: { select: { workflowRuns: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: repos };
  }

  async findOne(id: string, projectId: string, organizationId: string) {
    const repo = await this.prisma.repository.findFirst({
      where: { id, projectId, project: { organizationId } },
      select: {
        ...PUBLIC_REPOSITORY_SELECT,
        workflowRuns: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!repo) throw new NotFoundException('Repository not found.');
    return { data: repo };
  }

  async create(projectId: string, organizationId: string, dto: CreateRepositoryDto) {
    await this.assertProjectInOrg(projectId, organizationId);
    const webhookSecret = randomBytes(32).toString('hex');

    const repo = await this.prisma.repository.create({
      data: {
        projectId,
        fullName: dto.fullName,
        provider: RepositoryProvider.GITHUB,
        externalRepoId: dto.externalRepoId,
        defaultBranch: dto.defaultBranch || 'main',
        webhookSecret,
      },
      select: PUBLIC_REPOSITORY_SELECT,
    });

    // The secret is returned exactly once so the user can paste it into GitHub.
    return { data: { ...repo, webhookSecret } };
  }

  async remove(id: string, projectId: string, organizationId: string) {
    await this.findOne(id, projectId, organizationId);
    await this.prisma.repository.delete({ where: { id } });
    return { data: { id } };
  }
}
