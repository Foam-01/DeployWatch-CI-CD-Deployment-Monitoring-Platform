import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class HealthChecksService {
  constructor(private readonly prisma: PrismaService) {}

  async getServices(projectId: string, organizationId: string) {
    // Verify project belongs to org
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const services = await this.prisma.service.findMany({
      where: { projectId },
      include: {
        environment: { select: { name: true } },
        _count: { select: { healthChecks: true, incidents: true } },
      },
      orderBy: { name: 'asc' },
    });

    return { data: services };
  }

  async createService(projectId: string, organizationId: string, dto: CreateServiceDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const service = await this.prisma.service.create({
      data: {
        projectId,
        environmentId: dto.environmentId,
        name: dto.name,
        healthUrl: dto.healthUrl,
        intervalSeconds: dto.intervalSeconds ?? 60,
        timeoutMs: dto.timeoutMs ?? 5000,
        expectedHttpStatus: dto.expectedHttpStatus ?? 200,
        failureThreshold: dto.failureThreshold ?? 3,
        successThreshold: dto.successThreshold ?? 2,
        enabled: dto.enabled ?? true,
      },
    });

    return { data: service };
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    const service = await this.prisma.service.update({
      where: { id },
      data: dto,
    });
    return { data: service };
  }

  async getHealthHistory(serviceId: string, limit = 100) {
    const checks = await this.prisma.healthCheck.findMany({
      where: { serviceId },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
    return { data: checks };
  }
}
