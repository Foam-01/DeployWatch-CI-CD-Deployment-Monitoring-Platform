import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { SecretBox } from '../common/crypto/secret-box';
import { PrismaService } from '../common/prisma/prisma.service';
import { runsBackgroundJobs } from '../common/process-role';
import { safeHttpPostJson } from '../health-checks/ssrf-guard';
import { backoffMs, MAX_ATTEMPTS, STALE_LOCK_MS } from '../common/utils/retry';
import { readStoredConfig } from './channel-config';
import { NotificationEvent, toSlackPayload, toWebhookPayload } from './notification-events';

const SEND_TIMEOUT_MS = 10_000;

/** Outbound POST used for deliveries. Production binds the SSRF-guarded client; tests can swap it. */
export const OUTBOUND_HTTP = Symbol('OUTBOUND_HTTP');
export type OutboundHttp = (url: string, payload: unknown) => Promise<{ status: number }>;
export const safeOutboundHttp: OutboundHttp = (url, payload) =>
  safeHttpPostJson(url, payload, { timeoutMs: SEND_TIMEOUT_MS });
const BATCH_SIZE = 20;

export type SendOutcome = { ok: true } | { ok: false; retryable: boolean; error: string };

/** Classifies an HTTP status: 2xx sent; 408/429/5xx worth retrying; other 4xx are permanent. */
export function classifyStatus(status: number): SendOutcome {
  if (status >= 200 && status < 300) return { ok: true };
  const retryable = status === 408 || status === 429 || status >= 500;
  return { ok: false, retryable, error: `Destination responded with HTTP ${status}` };
}

/**
 * Sends queued deliveries (spec §6.6, critical case #5). Claims rows with
 * FOR UPDATE SKIP LOCKED so several workers never send the same delivery, retries
 * transient failures with backoff, and records status, attempts and the last error.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private readonly appUrl: string;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    config: ConfigService,
    @Inject(OUTBOUND_HTTP) private readonly post: OutboundHttp,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  @Cron('*/15 * * * * *')
  async dispatchDue(): Promise<number> {
    if (!runsBackgroundJobs() || this.draining) return 0;
    this.draining = true;
    try {
      const ids = await this.claim(BATCH_SIZE);
      for (const id of ids) await this.deliver(id);
      return ids.length;
    } finally {
      this.draining = false;
    }
  }

  /** Sends one delivery immediately (used by "Send test"). */
  async dispatchNow(deliveryId: string): Promise<void> {
    const [claimed] = await this.claim(1, Prisma.sql`AND id = ${deliveryId}::uuid`);
    if (claimed) await this.deliver(claimed);
  }

  private async claim(limit: number, extra: Prisma.Sql = Prisma.empty): Promise<string[]> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE notification_deliveries
      SET locked_at = now(), attempt_count = attempt_count + 1, last_attempt_at = now()
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE (locked_at IS NULL OR locked_at <= ${staleBefore})
          AND (status = 'PENDING' OR (status = 'FAILED' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ${now}))
          ${extra}
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    return rows.map((r) => r.id);
  }

  private async deliver(id: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id },
      include: { channel: true },
    });

    let outcome: SendOutcome;
    try {
      if (!delivery.channel.enabled) {
        outcome = { ok: false, retryable: false, error: 'Channel is disabled.' };
      } else {
        const { url } = readStoredConfig(this.secrets.decrypt(delivery.channel.configEncrypted));
        const event = delivery.payload as unknown as NotificationEvent;
        const body =
          delivery.channel.type === 'SLACK'
            ? toSlackPayload(event, this.appUrl)
            : toWebhookPayload(event, this.appUrl, delivery.createdAt);
        const res = await this.post(url, body);
        outcome = classifyStatus(res.status);
      }
    } catch (err) {
      // Network errors and timeouts are transient; SSRF blocks are not, but retrying them is harmless.
      outcome = { ok: false, retryable: true, error: err instanceof Error ? err.message : String(err) };
    }

    if (outcome.ok) {
      await this.prisma.notificationDelivery.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), lockedAt: null, nextAttemptAt: null, errorMsg: null },
      });
      return;
    }

    const retry = outcome.retryable && delivery.attemptCount < MAX_ATTEMPTS;
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMsg: outcome.error.slice(0, 500),
        lockedAt: null,
        nextAttemptAt: retry ? new Date(Date.now() + backoffMs(delivery.attemptCount)) : null,
      },
    });
    this.logger.warn(
      `Delivery ${id} via ${delivery.channel.type} failed (attempt ${delivery.attemptCount}${retry ? '' : ', giving up'}): ${outcome.error}`,
    );
  }
}
