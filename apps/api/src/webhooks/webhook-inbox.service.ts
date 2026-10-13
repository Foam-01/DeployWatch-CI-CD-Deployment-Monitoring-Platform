import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { runsBackgroundJobs } from '../common/process-role';
import { MAX_ATTEMPTS, STALE_LOCK_MS, backoffMs } from '../common/utils/retry';
import { WebhookEventProcessorService } from './webhook-event-processor.service';

export { MAX_ATTEMPTS, STALE_LOCK_MS, backoffMs } from '../common/utils/retry';
/** PENDING rows younger than this are still being handled inline by the request that stored them. */
export const PENDING_GRACE_MS = 30_000;
const BATCH_SIZE = 20;


/**
 * Database-backed event inbox. Every stored webhook is processed through `claim`,
 * an atomic UPDATE … FOR UPDATE SKIP LOCKED, so an event is handled by exactly one
 * process even when the request handler and several workers race for it.
 */
@Injectable()
export class WebhookInboxService {
  private readonly logger = new Logger(WebhookInboxService.name);
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: WebhookEventProcessorService,
  ) {}

  /** Fast path used right after a delivery is stored. */
  async processNow(eventId: string): Promise<'processed' | 'failed' | 'skipped'> {
    const [claimed] = await this.claim(Prisma.sql`id = ${eventId}::uuid AND processing_status = 'PENDING'`, 1);
    if (!claimed) return 'skipped';
    return this.run(claimed);
  }

  /** Worker path: picks up retries, events left PENDING by a crash, and expired claims. */
  @Cron('*/15 * * * * *')
  async processDueEvents(): Promise<number> {
    if (!runsBackgroundJobs() || this.draining) return 0;
    this.draining = true;
    try {
      const now = new Date();
      const due = Prisma.sql`
        (processing_status = 'PENDING' AND received_at <= ${new Date(now.getTime() - PENDING_GRACE_MS)})
        OR (processing_status = 'FAILED' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ${now})
        OR (processing_status = 'PROCESSING' AND locked_at <= ${new Date(now.getTime() - STALE_LOCK_MS)})`;
      const claimed = await this.claim(due, BATCH_SIZE);
      for (const id of claimed) await this.run(id);
      if (claimed.length) this.logger.log(`Reprocessed ${claimed.length} webhook event(s).`);
      return claimed.length;
    } finally {
      this.draining = false;
    }
  }

  private async claim(where: Prisma.Sql, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE webhook_events
      SET processing_status = 'PROCESSING', locked_at = now(), attempt_count = attempt_count + 1
      WHERE id IN (
        SELECT id FROM webhook_events
        WHERE ${where}
        ORDER BY received_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    return rows.map((r) => r.id);
  }

  private async run(eventId: string): Promise<'processed' | 'failed'> {
    const event = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    try {
      const repository = event.repositoryId
        ? await this.prisma.repository.findUnique({ where: { id: event.repositoryId } })
        : null;
      if (!repository) throw new Error('Repository was unlinked; event cannot be applied.');

      await this.processor.process(event.eventType, event.payload, repository);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { processingStatus: 'PROCESSED', processedAt: new Date(), lockedAt: null, nextAttemptAt: null, errorMsg: null },
      });
      return 'processed';
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      const exhausted = event.attemptCount >= MAX_ATTEMPTS;
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          processingStatus: 'FAILED',
          errorMsg: message,
          lockedAt: null,
          nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMs(event.attemptCount)),
        },
      });
      this.logger.warn(
        `Webhook event ${eventId} failed (attempt ${event.attemptCount}/${MAX_ATTEMPTS}${exhausted ? ', giving up' : ''}): ${message}`,
      );
      return 'failed';
    }
  }
}
