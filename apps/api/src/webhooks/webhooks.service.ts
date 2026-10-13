import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecretBox } from '../common/crypto/secret-box';
import { WebhookInboxService } from './webhook-inbox.service';
import { verifyGitHubSignature } from './github-signature';

export interface GitHubWebhookOptions {
  repositoryId: string;
  deliveryId: string;
  eventType: string;
  signature: string | undefined;
  rawBody: Buffer | undefined;
  payload: unknown;
}

export type WebhookResult = 'processed' | 'duplicate' | 'failed' | 'ignored';

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Invalid webhook signature.');
  }
}

/** Only these events are persisted; anything else is acknowledged and dropped. */
const SUPPORTED_EVENTS = new Set(['workflow_run', 'deployment_status', 'ping']);

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: WebhookInboxService,
    private readonly secrets: SecretBox,
  ) {}

  async handleGitHubEvent(options: GitHubWebhookOptions): Promise<WebhookResult> {
    const { repositoryId, deliveryId, eventType, signature, rawBody, payload } = options;

    // 1. Resolve the integration. The repository identity comes from our own record,
    //    never from the payload's repository name.
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: { project: { select: { organizationId: true } } },
    });

    // 2. Unknown repository or one without a secret cannot be verified: treat exactly
    //    like a bad signature so callers cannot probe which IDs exist.
    if (!repository?.webhookSecret || !verifyGitHubSignature(rawBody, signature, this.secrets.decrypt(repository.webhookSecret))) {
      throw new InvalidWebhookSignatureError();
    }

    if (!SUPPORTED_EVENTS.has(eventType)) {
      this.logger.debug(`Ignoring unsupported event type "${eventType}" (${deliveryId})`);
      return 'ignored';
    }

    // 3. Persist to the inbox. The (provider, deliveryId) unique constraint is the
    //    idempotency guard, so concurrent redeliveries cannot both be stored.
    let eventId: string;
    try {
      const event = await this.prisma.webhookEvent.create({
        data: {
          organizationId: repository.project.organizationId,
          repositoryId: repository.id,
          provider: 'GITHUB',
          deliveryId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          signature,
          processingStatus: 'PENDING',
        },
      });
      eventId = event.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return 'duplicate';
      }
      throw err;
    }

    // 4. The event is durable now, so GitHub can be acknowledged whatever happens next.
    //    Process it immediately; on failure (or if this process dies here) the worker
    //    retries it from the inbox with backoff.
    const result = await this.inbox.processNow(eventId);
    return result === 'failed' ? 'failed' : 'processed';
  }
}
