import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HealthCheckStatus, Service } from '@prisma/client';
import { evaluateHealth } from './health-state';
import { safeHttpGet, TimeoutError } from './ssrf-guard';
import { runsBackgroundJobs } from '../common/process-role';

@Injectable()
export class HealthCheckSchedulerService {
  private readonly logger = new Logger(HealthCheckSchedulerService.name);
  private readonly concurrency: number;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
        await Promise.allSettled(batch.map((s) => this.checkService(s)));
      }
    } catch (error: any) {
      this.logger.error(`Health check scheduler error: ${error.message}`);
    } finally {
      this.running = false;
    }
  }

  private async checkService(service: Service) {
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
    const next = evaluateHealth(service, status === 'PASS');
    await this.prisma.service.update({
      where: { id: service.id },
      data: {
        lastCheckedAt: new Date(),
        currentStatus: next.currentStatus,
        consecutiveFailures: next.consecutiveFailures,
        consecutiveSuccesses: next.consecutiveSuccesses,
      },
    });

    if (next.event === 'WENT_DOWN') await this.handleDown(service);
    if (next.event === 'RECOVERED') await this.handleRecovery(service);

    this.logger.debug(`[${service.name}] ${status} | ${httpStatus ?? 'N/A'} | ${latencyMs}ms`);
  }

  private async handleDown(service: Service) {
    this.logger.warn(`Service DOWN: ${service.name} (${service.healthUrl})`);

    // Check if there's already an open incident
    const existingIncident = await this.prisma.incident.findFirst({
      where: {
        serviceId: service.id,
        status: { not: 'RESOLVED' },
      },
    });

    if (existingIncident) return;

    // Create new incident
    const incident = await this.prisma.incident.create({
      data: {
        serviceId: service.id,
        title: `Service Down: ${service.name}`,
        description: `Automatic incident created after ${service.failureThreshold} consecutive failed health checks.`,
        severity: 'HIGH',
        status: 'OPEN',
      },
    });

    await this.prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        eventType: 'OPENED',
        message: `Service failed health check ${service.failureThreshold} times consecutively.`,
      },
    });
  }

  private async handleRecovery(service: Service) {
    this.logger.log(`Service RECOVERED: ${service.name}`);

    // Find open incident and suggest resolution
    const openIncident = await this.prisma.incident.findFirst({
      where: {
        serviceId: service.id,
        status: { not: 'RESOLVED' },
      },
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
  }
}
