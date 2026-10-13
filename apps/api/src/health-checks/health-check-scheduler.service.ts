import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HealthCheckStatus, Service } from '@prisma/client';
import { evaluateHealth } from './health-state';
import { safeHttpGet, TimeoutError } from './ssrf-guard';
import { runsBackgroundJobs } from '../common/process-role';
import { NotifierService } from '../notifications/notifier.service';
import { serviceDownFailureThreshold } from '../common/utils/alert-rule-config';

@Injectable()
export class HealthCheckSchedulerService {
  private readonly logger = new Logger(HealthCheckSchedulerService.name);
  private readonly concurrency: number;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifier: NotifierService,
  ) {
    this.concurrency = Number(this.config.get('HEALTH_CHECK_CONCURRENCY', 10)) || 10;
  }

  /**
   * Runs every 30 seconds to check which services are due for a health check.
   */
  @Cron('*/30 * * * * *')
  async runHealthChecks() {
    if (!runsBackgroundJobs()) return;
    if (this.running) {
      this.logger.debug('Health check run already in progress, skipping.');
      return;
    }

    this.running = true;

    try {
      const now = new Date();

      // Find all enabled services that are due for a check
      const services = await this.prisma.service.findMany({
        where: { enabled: true },
      });

      const projectIds = [...new Set(services.map((service) => service.projectId))];
      const rules = projectIds.length
        ? await this.prisma.alertRule.findMany({
            where: { projectId: { in: projectIds }, eventType: 'SERVICE_DOWN', enabled: true },
            select: { projectId: true, config: true },
          })
        : [];
      const thresholdOverrides = new Map<string, number>();
      for (const rule of rules) {
        const threshold = serviceDownFailureThreshold(rule.config);
        if (threshold === undefined) {
          this.logger.error(`Ignoring invalid SERVICE_DOWN alert rule config for project ${rule.projectId}.`);
          continue;
        }
        thresholdOverrides.set(rule.projectId, threshold);
      }

      const due = services.filter((service) => {
        if (!service.lastCheckedAt) return true;
        const nextCheckAt = new Date(
          service.lastCheckedAt.getTime() + service.intervalSeconds * 1000,
        );
        return now >= nextCheckAt;
      });

      if (due.length === 0) return;

      this.logger.log(`Checking ${due.length} service(s)...`);

      // Process in batches
      for (let i = 0; i < due.length; i += this.concurrency) {
        const batch = due.slice(i, i + this.concurrency);
        await Promise.allSettled(batch.map((service) =>
          this.checkService(service, thresholdOverrides.get(service.projectId)),
        ));
      }
    } catch (error: any) {
      this.logger.error(`Health check scheduler error: ${error.message}`);
    } finally {
      this.running = false;
    }
  }

  private async checkService(service: Service, projectFailureThreshold?: number) {
    const startMs = Date.now();
    let status: HealthCheckStatus = 'FAIL';
    let httpStatus: number | undefined;
    let errorMsg: string | undefined;

    try {
      const res = await safeHttpGet(service.healthUrl, { timeoutMs: service.timeoutMs });
      httpStatus = res.status;
      status = res.status === service.expectedHttpStatus ? 'PASS' : 'FAIL';
      if (status === 'FAIL') errorMsg = `Expected HTTP ${service.expectedHttpStatus}, got ${res.status}`;
    } catch (err) {
      status = err instanceof TimeoutError ? 'TIMEOUT' : 'FAIL';
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = Date.now() - startMs;

    await this.prisma.healthCheck.create({
      data: { serviceId: service.id, status, httpStatus, latencyMs, errorMsg: errorMsg?.slice(0, 500) },
    });

    // Timeouts count as failures (spec: "Health Endpoint Timeout ต้องนับเป็นความล้มเหลว").
    const failureThreshold = projectFailureThreshold ?? service.failureThreshold;
    const next = evaluateHealth({ ...service, failureThreshold }, status === 'PASS');
    await this.prisma.service.update({
      where: { id: service.id },
      data: {
        lastCheckedAt: new Date(),
        currentStatus: next.currentStatus,
        consecutiveFailures: next.consecutiveFailures,
        consecutiveSuccesses: next.consecutiveSuccesses,
      },
    });

    if (next.event === 'WENT_DOWN') await this.handleDown(service, failureThreshold);
    if (next.event === 'RECOVERED') await this.handleRecovery(service);

    this.logger.debug(`[${service.name}] ${status} | ${httpStatus ?? 'N/A'} | ${latencyMs}ms`);
  }

  private async handleDown(service: Service, failureThreshold: number) {
    this.logger.warn(`Service DOWN: ${service.name} (${service.healthUrl})`);

    // One open incident per service: repeated failures while DOWN do not open more.
    const existingIncident = await this.prisma.incident.findFirst({
      where: { serviceId: service.id, status: { not: 'RESOLVED' } },
    });
    if (existingIncident) return;

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          serviceId: service.id,
          title: `Service Down: ${service.name}`,
          description: `Automatic incident created after ${failureThreshold} consecutive failed health checks.`,
          severity: 'HIGH',
          status: 'OPEN',
        },
      });
      await tx.incidentEvent.create({
        data: {
          incidentId: created.id,
          eventType: 'OPENED',
          message: `Service failed health check ${failureThreshold} times consecutively.`,
        },
      });
      return created;
    });

    const organizationId = await this.organizationOf(service);
    await this.notifier.emitSafely({
      organizationId,
      type: 'SERVICE_DOWN',
      eventKey: `service_down:${incident.id}`,
      title: `${service.name} is down`,
      body: `${failureThreshold} consecutive failed checks on ${service.healthUrl}`,
      link: `/services/${service.id}`,
    });
    await this.notifier.emitSafely({
      organizationId,
      type: 'INCIDENT_OPENED',
      eventKey: `incident_opened:${incident.id}`,
      title: incident.title,
      body: incident.description ?? undefined,
      link: `/incidents/${incident.id}`,
    });
  }

  private async handleRecovery(service: Service) {
    this.logger.log(`Service RECOVERED: ${service.name}`);

    const openIncident = await this.prisma.incident.findFirst({
      where: { serviceId: service.id, status: { not: 'RESOLVED' } },
    });
    if (openIncident) {
      await this.prisma.incidentEvent.create({
        data: {
          incidentId: openIncident.id,
          eventType: 'COMMENT',
          message: `Service health check passing again after ${service.successThreshold} consecutive successes. Consider resolving this incident.`,
        },
      });
    }

    await this.notifier.emitSafely({
      organizationId: await this.organizationOf(service),
      type: 'SERVICE_RECOVERED',
      // Tied to the incident it recovers from, or to this moment when there was none.
      eventKey: `service_recovered:${openIncident?.id ?? `${service.id}:${Date.now()}`}`,
      title: `${service.name} recovered`,
      body: openIncident
        ? `${service.successThreshold} consecutive passing checks. The incident is still open; resolve it when you are satisfied.`
        : `${service.successThreshold} consecutive passing checks.`,
      link: openIncident ? `/incidents/${openIncident.id}` : `/services/${service.id}`,
    });
  }

  private async organizationOf(service: Service): Promise<string> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: service.projectId },
      select: { organizationId: true },
    });
    return project.organizationId;
  }
}
