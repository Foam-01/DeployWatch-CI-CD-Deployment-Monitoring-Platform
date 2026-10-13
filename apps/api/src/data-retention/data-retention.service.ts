import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { runsBackgroundJobs } from '../common/process-role';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);
  private readonly healthCheckDays: number;
  private readonly webhookPayloadDays: number;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.healthCheckDays = this.retentionDays(config, 'HEALTH_CHECK_RETENTION_DAYS', 30);
    this.webhookPayloadDays = this.retentionDays(config, 'WEBHOOK_EVENT_RETENTION_DAYS', 90);
  }

  /** Purges old probe history and redacts payloads from completed webhook inbox rows daily. */
  @Cron('0 15 3 * * *')
  async runRetention() {
    if (!runsBackgroundJobs()) return;
    if (this.running) {
      this.logger.debug('Data retention run already in progress, skipping.');
      return;
    }

    this.running = true;
    try {
      const now = Date.now();
      const healthCheckCutoff = new Date(now - this.healthCheckDays * DAY_MS);
      const webhookPayloadCutoff = new Date(now - this.webhookPayloadDays * DAY_MS);
      const [healthChecks, webhookEvents] = await Promise.all([
        this.prisma.healthCheck.deleteMany({
          where: { checkedAt: { lt: healthCheckCutoff } },
        }),
        this.prisma.webhookEvent.updateMany({
          where: {
            receivedAt: { lt: webhookPayloadCutoff },
            OR: [
              { processingStatus: 'PROCESSED' },
              { processingStatus: 'FAILED', nextAttemptAt: null },
            ],
          },
          data: { payload: Prisma.JsonNull },
        }),
      ]);

      if (healthChecks.count || webhookEvents.count) {
        this.logger.log(
          `Data retention removed ${healthChecks.count} health check(s) and redacted ${webhookEvents.count} webhook payload(s).`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Data retention job failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private retentionDays(config: ConfigService, key: string, fallback: number): number {
    const value = config.get<string | number>(key, fallback);
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1) {
      throw new Error(`${key} must be a positive integer number of days.`);
    }
    return days;
  }
}
