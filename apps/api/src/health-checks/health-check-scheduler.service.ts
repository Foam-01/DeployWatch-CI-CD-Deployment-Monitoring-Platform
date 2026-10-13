import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthCheckSchedulerService {
  private readonly logger = new Logger(HealthCheckSchedulerService.name);
  private readonly concurrency: number;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.concurrency = this.config.get<number>('HEALTH_CHECK_CONCURRENCY', 10);
  }

  /**
   * Runs every 30 seconds to check which services are due for a health check.
   */
  @Cron('*/30 * * * * *')
  async runHealthChecks() {
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

  private async checkService(service: any) {
    const startMs = Date.now();
    let status: 'PASS' | 'FAIL' | 'TIMEOUT' = 'FAIL';
    let httpStatus: number | undefined;
    let errorMsg: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), service.timeoutMs);

      try {
        const response = await fetch(service.healthUrl, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeout);
        httpStatus = response.status;
        status = response.status === service.expectedHttpStatus ? 'PASS' : 'FAIL';
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          status = 'TIMEOUT';
          errorMsg = `Request timed out after ${service.timeoutMs}ms`;
        } else {
          status = 'FAIL';
          errorMsg = err.message;
        }
      }
    } catch (err: any) {
      status = 'FAIL';
      errorMsg = err.message;
    }

    const latencyMs = Date.now() - startMs;

    // Persist health check result
    await this.prisma.healthCheck.create({
      data: {
        serviceId: service.id,
        status,
        httpStatus,
        latencyMs,
        errorMsg,
      },
    });

    // Update service counters and status
    await this.updateServiceStatus(service, status);

    this.logger.debug(
      `[${service.name}] ${status} | ${httpStatus ?? 'N/A'} | ${latencyMs}ms`,
    );
  }

  private async updateServiceStatus(service: any, checkStatus: 'PASS' | 'FAIL' | 'TIMEOUT') {
    const isPassing = checkStatus === 'PASS';

    const update: any = {
      lastCheckedAt: new Date(),
    };

    if (isPassing) {
      update.consecutiveSuccesses = { increment: 1 };
      update.consecutiveFailures = 0;

      // Check recovery threshold
      const newSuccesses = service.consecutiveSuccesses + 1;
      if (
        service.currentStatus !== 'HEALTHY' &&
        newSuccesses >= service.successThreshold
      ) {
        update.currentStatus = 'HEALTHY';
        await this.handleRecovery(service);
      }
    } else {
      update.consecutiveFailures = { increment: 1 };
      update.consecutiveSuccesses = 0;

      // Check failure threshold
      const newFailures = service.consecutiveFailures + 1;
      if (
        service.currentStatus !== 'DOWN' &&
        newFailures >= service.failureThreshold
      ) {
        update.currentStatus = 'DOWN';
        await this.handleDown(service);
      } else if (newFailures >= 1 && service.currentStatus === 'HEALTHY') {
        update.currentStatus = 'DEGRADED';
      }
    }

    await this.prisma.service.update({
      where: { id: service.id },
      data: update,
    });
  }

  private async handleDown(service: any) {
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

  private async handleRecovery(service: any) {
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
