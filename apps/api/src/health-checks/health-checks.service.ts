import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertResolvesToPublicAddress } from './ssrf-guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseLimit } from '../common/utils/pagination';
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
    await this.assertSafeHealthUrl(dto.healthUrl);
    if (dto.environmentId) await this.assertEnvironmentInProject(dto.environmentId, projectId);

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

  async getAllServices(organizationId: string) {
    const services = await this.prisma.service.findMany({
      where: { project: { organizationId } },
      include: {
        environment: { select: { name: true } },
        project: { select: { id: true, name: true } },
        healthChecks: { orderBy: { checkedAt: 'desc' }, take: 1, select: { latencyMs: true, httpStatus: true } },
      },
      orderBy: { name: 'asc' },
    });
    return { data: services };
  }

  async getService(id: string, organizationId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, project: { organizationId } },
      include: {
        environment: { select: { name: true } },
        project: { select: { id: true, name: true } },
        incidents: { orderBy: { openedAt: 'desc' }, take: 10 },
      },
    });
    if (!service) throw new NotFoundException('Service not found.');
    return { data: service };
  }

  async updateService(id: string, organizationId: string, dto: UpdateServiceDto) {
    const { data: existing } = await this.getService(id, organizationId);
    if (dto.healthUrl) await this.assertSafeHealthUrl(dto.healthUrl);
    if (dto.environmentId) await this.assertEnvironmentInProject(dto.environmentId, existing.projectId);
    const service = await this.prisma.service.update({
      where: { id },
      data: dto,
    });
    return { data: service };
  }

  private async assertEnvironmentInProject(environmentId: string, projectId: string) {
    const env = await this.prisma.environment.findFirst({ where: { id: environmentId, projectId } });
    if (!env) throw new BadRequestException('environmentId does not belong to this project.');
  }

  /** Rejects URLs that point at loopback, private, link-local or metadata addresses. */
  private async assertSafeHealthUrl(url: string) {
    try {
      await assertResolvesToPublicAddress(url);
    } catch (err) {
      throw new BadRequestException(
        `healthUrl is not allowed: ${err instanceof Error ? err.message : 'unresolvable host'}`,
      );
    }
  }

  async getHealthHistory(serviceId: string, organizationId: string, limit?: unknown) {
    await this.getService(serviceId, organizationId);
    const checks = await this.prisma.healthCheck.findMany({
      where: { serviceId },
      orderBy: { checkedAt: 'desc' },
      take: parseLimit(limit, 100),
    });
    return { data: checks };
  }
}
