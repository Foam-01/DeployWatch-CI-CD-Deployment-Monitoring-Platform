import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { SecretBox } from '../../src/common/crypto/secret-box';
import {
  MAX_ATTEMPTS,
  PENDING_GRACE_MS,
  STALE_LOCK_MS,
  WebhookInboxService,
} from '../../src/webhooks/webhook-inbox.service';
import {
  API,
  TestOrg,
  createMember,
  createOrgFixture,
  createTestApp,
  resetDatabase,
  resetThrottling,
  sign,
  workflowRunPayload,
} from './helpers';

/**
 * Event inbox and retry worker (spec acceptance: "Worker ประมวลผล Event ที่ค้างหลัง Restart ได้").
 * Time is moved by editing timestamps, so tests never sleep.
 */
describe('Webhook inbox worker (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: WebhookInboxService;
  let org: TestOrg;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    inbox = app.get(WebhookInboxService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    org = await createOrgFixture(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const ago = (ms: number) => new Date(Date.now() - ms);

  /** Inserts an inbox row directly, as if a process stored it and then died. */
  function storeEvent(data: Partial<Prisma.WebhookEventUncheckedCreateInput> = {}) {
    return prisma.webhookEvent.create({
      data: {
        organizationId: org.orgId,
        repositoryId: org.repositoryId,
        provider: 'GITHUB',
        deliveryId: `d-${Math.random()}`,
        eventType: 'workflow_run',
        payload: workflowRunPayload(),
        processingStatus: 'PENDING',
        ...data,
      },
    });
  }

  it('TC-Q01 processes an event left PENDING by a crash, once the grace period has passed', async () => {
    const event = await storeEvent({ receivedAt: ago(PENDING_GRACE_MS + 1000) });

    expect(await inbox.processDueEvents()).toBe(1);

    const after = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(after).toMatchObject({ processingStatus: 'PROCESSED', attemptCount: 1, lockedAt: null });
    expect(await prisma.workflowRun.count()).toBe(1);
  });

  it('TC-Q02 leaves very recent PENDING events to the request that is handling them', async () => {
    await storeEvent({ receivedAt: new Date() });
    expect(await inbox.processDueEvents()).toBe(0);
  });

  it('TC-Q03 a failure schedules a retry with backoff; the retry succeeds once the cause is fixed', async () => {
    // Environment missing → deployment_status cannot be applied.
    const payload = {
      deployment: { id: 9, sha: 'f'.repeat(40), environment: 'Staging', created_at: '2026-10-13T09:00:00Z' },
      deployment_status: { state: 'success' },
    };
    const event = await storeEvent({ eventType: 'deployment_status', payload, receivedAt: ago(PENDING_GRACE_MS + 1000) });

    await inbox.processDueEvents();
    let row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.processingStatus).toBe('FAILED');
    expect(row.errorMsg).toMatch(/Staging/);
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Not due yet → untouched.
    expect(await inbox.processDueEvents()).toBe(0);

    // Fix the cause and let the retry time arrive.
    await prisma.environment.create({ data: { projectId: org.projectId, name: 'Staging', slug: 'staging' } });
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: ago(1) } });

    expect(await inbox.processDueEvents()).toBe(1);
    row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ processingStatus: 'PROCESSED', attemptCount: 2, nextAttemptAt: null, errorMsg: null });
    expect(await prisma.deployment.count()).toBe(1);
  });

  it(`TC-Q04 gives up after ${MAX_ATTEMPTS} attempts and keeps the error for inspection`, async () => {
    const event = await storeEvent({
      payload: { workflow_run: { id: 1 } }, // permanently invalid
      processingStatus: 'FAILED',
      attemptCount: MAX_ATTEMPTS - 1,
      nextAttemptAt: ago(1),
    });

    await inbox.processDueEvents();
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ processingStatus: 'FAILED', attemptCount: MAX_ATTEMPTS, nextAttemptAt: null });
    expect(row.errorMsg).toMatch(/missing required fields/);

    expect(await inbox.processDueEvents()).toBe(0);
  });

  it('TC-Q05 reclaims an event whose worker died mid-processing, but not a live claim', async () => {
    const stale = await storeEvent({ processingStatus: 'PROCESSING', lockedAt: ago(STALE_LOCK_MS + 1000), attemptCount: 1 });
    await storeEvent({ processingStatus: 'PROCESSING', lockedAt: new Date(), attemptCount: 1, deliveryId: 'live' });

    expect(await inbox.processDueEvents()).toBe(1);
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: stale.id } });
    expect(row).toMatchObject({ processingStatus: 'PROCESSED', attemptCount: 2 });
  });

  it('TC-Q06 concurrent workers never process the same event twice', async () => {
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        storeEvent({
          receivedAt: ago(PENDING_GRACE_MS + 1000),
          payload: workflowRunPayload({ id: 5000 + i, run_number: i }),
        }),
      ),
    );

    // Two independent "workers" draining at the same time (bypassing the in-process guard).
    const drain = () => (inbox as unknown as { claim: (w: unknown, n: number) => Promise<string[]> });
    const due = Prisma.sql`processing_status = 'PENDING'`;
    const [a, b] = await Promise.all([drain().claim(due, 6), drain().claim(due, 6)]);

    expect(a.length + b.length).toBe(6);
    expect(new Set([...a, ...b]).size).toBe(6);
  });

  it('TC-Q07 a webhook whose processing fails is still acknowledged with 200 and queued for retry', async () => {
    const body = JSON.stringify({ workflow_run: { id: 77 } });
    await request(app.getHttpServer())
      .post(`${API}/webhooks/github/${org.repositoryId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'workflow_run')
      .set('X-GitHub-Delivery', 'will-fail')
      .set('X-Hub-Signature-256', sign(body, org.webhookSecret))
      .send(body)
      .expect(200);

    const row = await prisma.webhookEvent.findFirstOrThrow();
    expect(row.processingStatus).toBe('FAILED');
    expect(row.nextAttemptAt).not.toBeNull();
  });

  it('TC-Q08 webhook secrets are stored encrypted and still verify signatures', async () => {
    const owner = await createMember(app, prisma, org.orgId, 'OWNER');
    const res = await request(app.getHttpServer())
      .post(`${API}/projects/${org.projectId}/repositories`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ fullName: 'acme/encrypted', externalRepoId: '4242' })
      .expect(201);
    const { id, webhookSecret } = res.body.data;

    const stored = await prisma.repository.findUniqueOrThrow({ where: { id } });
    expect(SecretBox.isEncrypted(stored.webhookSecret!)).toBe(true);
    expect(stored.webhookSecret).not.toContain(webhookSecret);

    const body = JSON.stringify(workflowRunPayload());
    await request(app.getHttpServer())
      .post(`${API}/webhooks/github/${id}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'workflow_run')
      .set('X-GitHub-Delivery', 'enc-1')
      .set('X-Hub-Signature-256', sign(body, webhookSecret))
      .send(body)
      .expect(200);
    expect(await prisma.workflowRun.count({ where: { repositoryId: id } })).toBe(1);
  });
});
