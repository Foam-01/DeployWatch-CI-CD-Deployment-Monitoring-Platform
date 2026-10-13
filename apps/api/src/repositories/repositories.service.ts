import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RepositoryProvider } from '@prisma/client';

@Injectable()
export class RepositoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string) {
    return this.prisma.repository.findMany({
      where: { projectId },
      include: {
        _count: {
          select: { workflowRuns: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const repo = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        project: true,
        workflowRuns: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!repo) throw new NotFoundException('Repository not found');
    return repo;
  }

  async create(data: {
    projectId: string;
    fullName: string;
    provider?: RepositoryProvider;
    externalRepoId: string;
    defaultBranch?: string;
    webhookSecret?: string;
  }) {
    return this.prisma.repository.create({
      data: {
        projectId: data.projectId,
        fullName: data.fullName,
        provider: data.provider || RepositoryProvider.GITHUB,
        externalRepoId: data.externalRepoId,
        defaultBranch: data.defaultBranch || 'main',
        webhookSecret: data.webhookSecret || 'whsec_' + Math.random().toString(36).substring(2, 15),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.repository.delete({ where: { id } });
  }
}
