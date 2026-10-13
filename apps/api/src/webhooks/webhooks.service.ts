import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebhookEventProcessorService } from './webhook-event-processor.service';

export interface GitHubWebhookOptions {
  repositoryId: string;
  deliveryId: string;
  eventType: string;
  signature: string;
  rawBody: Buffer;
  payload: any;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: WebhookEventProcessorService,
  ) {}

  async handleGitHubEvent(options: GitHubWebhookOptions) {
    const { repositoryId, deliveryId, eventType, signature, rawBody, payload } = options;

    // 1. Lookup repository + webhook secret
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: { project: { include: { organization: true } } },
    });

    if (!repository) {
      this.logger.warn(`Webhook received for unknown repository: ${repositoryId}`);
      return; // Don't error — return 200 to GitHub
    }

    // 2. Verify HMAC-SHA256 signature (constant-time comparison)
    if (repository.webhookSecret) {
      this.verifySignature(rawBody, signature, repository.webhookSecret);
    }

    // 3. Deduplicate: upsert WebhookEvent, bail if duplicate
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_deliveryId: { provider: 'GITHUB', deliveryId } },
    });

    if (existing) {
      throw new Error('DUPLICATE_EVENT');
    }

    // 4. Persist event to inbox
    const event = await this.prisma.webhookEvent.create({
      data: {
        organizationId: repository.project.organizationId,
        repositoryId: repository.id,
        provider: 'GITHUB',
        deliveryId,
        eventType,
        payload,
        signature,
        processingStatus: 'PENDING',
      },
    });

    // 5. Process synchronously for MVP (could be async worker)
    // Mark as processing
    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processingStatus: 'PROCESSING', attemptCount: { increment: 1 } },
    });

    try {
      await this.processor.process(event.id, eventType, payload, repository);

      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err: any) {
      this.logger.error(`Failed to process webhook event ${event.id}: ${err.message}`);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: 'FAILED', errorMsg: err.message },
      });
    }
  }

  private verifySignature(rawBody: Buffer, signature: string, secret: string) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const expected = `sha256=${hmac.digest('hex')}`;

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature ?? '');

    if (
      expectedBuf.length !== signatureBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      throw new Error('INVALID_SIGNATURE');
    }
  }
}
