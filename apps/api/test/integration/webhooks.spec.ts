import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  API,
  TestOrg,
  createOrgFixture,
  createTestApp,
  resetDatabase,
  resetThrottling,
  sign,
  workflowRunPayload,
} from './helpers';

describe('GitHub webhook ingestion (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: TestOrg;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  describe('GitLab and Jenkins webhook ingestion (integration)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let org: TestOrg;

    beforeAll(async () => {
      ({ app, prisma } = await createTestApp());
    });

    beforeEach(async () => {
      await resetDatabase(prisma);
      resetThrottling(app);
      org = await createOrgFixture(prisma);
    });

    afterAll(async () => {
      await app.close();
    });

    it('authenticates and ingests GitLab pipeline hooks idempotently', async () => {
      await prisma.repository.update({
        where: { id: org.repositoryId },
        data: { provider: 'GITLAB', integrationUrl: 'https://gitlab.com' },
      });
      const payload = {
        object_kind: 'pipeline',
        object_attributes: {
          id: 9_123_456_789,
          iid: 42,
          ref: 'main',
          sha: 'c'.repeat(40),
          status: 'success',
          created_at: '2026-10-14T08:00:00Z',
          finished_at: '2026-10-14T08:01:00Z',
          web_url: 'https://gitlab.com/acme/repo/-/pipelines/42',
        },
        project: { name: 'GitLab Repo', web_url: 'https://gitlab.com/acme/repo' },
      };
      const body = JSON.stringify(payload);
      const send = () =>
        request(app.getHttpServer())
          .post(`${API}/webhooks/gitlab/${org.repositoryId}`)
          .set('Content-Type', 'application/json')
          .set('X-Gitlab-Event', 'Pipeline Hook')
          .set('X-Gitlab-Event-UUID', 'gitlab-pipeline-42')
          .set('X-Gitlab-Token', org.webhookSecret)
          .send(body);

      await send().expect(200);
      expect((await send()).body.duplicate).toBe(true);
      expect(await prisma.webhookEvent.count()).toBe(1);
      const run = await prisma.workflowRun.findFirstOrThrow();
      expect(run).toMatchObject({
        externalRunId: BigInt('9123456789'),
        runNumber: 42,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        branch: 'main',
      });

      await request(app.getHttpServer())
        .post(`${API}/webhooks/gitlab/${org.repositoryId}`)
        .set('Content-Type', 'application/json')
        .set('X-Gitlab-Event', 'Pipeline Hook')
        .set('X-Gitlab-Token', 'wrong-token')
        .send(body)
        .expect(401);
    });

    it('ingests GitLab deployment hooks into the configured environment', async () => {
      await prisma.repository.update({
        where: { id: org.repositoryId },
        data: { provider: 'GITLAB', integrationUrl: 'https://gitlab.com' },
      });
      const body = JSON.stringify({
        object_kind: 'deployment',
        status: 'success',
        deployable: {
          id: 5555,
          sha: 'd'.repeat(40),
          created_at: '2026-10-14T08:00:00Z',
          finished_at: '2026-10-14T08:01:00Z',
        },
        environment: { name: 'Production', external_url: 'https://prod.example.com' },
        user: { username: 'release-bot' },
      });
      await request(app.getHttpServer())
        .post(`${API}/webhooks/gitlab/${org.repositoryId}`)
        .set('Content-Type', 'application/json')
        .set('X-Gitlab-Event', 'Deployment Hook')
        .set('X-Gitlab-Event-UUID', 'gitlab-deployment-55')
        .set('X-Gitlab-Token', org.webhookSecret)
        .send(body)
        .expect(200);

      expect(await prisma.deployment.findFirstOrThrow()).toMatchObject({
        externalDeploymentId: '5555',
        status: 'SUCCESS',
        environmentId: org.environmentId,
        commitSha: 'd'.repeat(40),
      });
    });

    it('verifies Jenkins HMAC signatures over the raw body before ingesting a build', async () => {
      await prisma.repository.update({
        where: { id: org.repositoryId },
        data: { provider: 'JENKINS', integrationUrl: 'https://jenkins.example.com' },
      });
      const payload = {
        build_number: 17,
        build_status: 'SUCCESS',
        job_name: 'folder/service',
        build_url: 'https://jenkins.example.com/job/folder/job/service/17/',
        git_branch: 'main',
        git_commit: 'e'.repeat(40),
        timestamp: '2026-10-14T08:00:00Z',
        completed_at: '2026-10-14T08:02:00Z',
      };
      const body = JSON.stringify(payload);
      const send = (signature: string) =>
        request(app.getHttpServer())
          .post(`${API}/webhooks/jenkins/${org.repositoryId}`)
          .set('Content-Type', 'application/json')
          .set('X-DeployWatch-Event', 'build')
          .set('X-DeployWatch-Delivery', 'jenkins-build-17')
          .set('X-DeployWatch-Signature', signature)
          .send(body);

      await send(sign(body, org.webhookSecret)).expect(200);
      const run = await prisma.workflowRun.findFirstOrThrow();
      expect(run).toMatchObject({
        externalRunId: BigInt(17),
        runNumber: 17,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        branch: 'main',
      });
      await send(sign(body, 'wrong-secret')).expect(401);
    });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    org = await createOrgFixture(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Sends a payload exactly as GitHub would: raw JSON body signed with the repo secret. */
  function deliver(
    payload: unknown,
    opts: { deliveryId?: string; event?: string; secret?: string; signature?: string } = {},
  ) {
    const body = JSON.stringify(payload);
    return request(app.getHttpServer())
      .post(`${API}/webhooks/github/${org.repositoryId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', opts.event ?? 'workflow_run')
      .set('X-GitHub-Delivery', opts.deliveryId ?? `delivery-${Math.random()}`)
      .set('X-Hub-Signature-256', opts.signature ?? sign(body, opts.secret ?? org.webhookSecret))
      .send(body);
  }

  it('TC-W01 stores a correctly signed workflow_run and creates the run', async () => {
    await deliver(workflowRunPayload()).expect(200);

    const runs = await prisma.workflowRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'COMPLETED', conclusion: 'SUCCESS', branch: 'main', runNumber: 42 });

    const events = await prisma.webhookEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0].processingStatus).toBe('PROCESSED');
  });

  it('TC-W02 stores realistic large run IDs exactly and returns them as strings', async () => {
    await deliver(workflowRunPayload({ id: 18_123_456_789 })).expect(200);
    const run = await prisma.workflowRun.findFirstOrThrow();
    expect(run.externalRunId).toBe(BigInt('18123456789'));
  });

  it('TC-W02b refuses run IDs beyond 2^53 instead of storing a rounded, wrong ID', async () => {
    // Raw JSON so the test itself never rounds the number.
    const body = JSON.stringify(workflowRunPayload({ id: 1 })).replace('"id":1,', '"id":9007199254740993,');
    await request(app.getHttpServer())
      .post(`${API}/webhooks/github/${org.repositoryId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'workflow_run')
      .set('X-GitHub-Delivery', 'unsafe-id')
      .set('X-Hub-Signature-256', sign(body, org.webhookSecret))
      .send(body)
      .expect(200);

    expect(await prisma.workflowRun.count()).toBe(0);
    const event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event.processingStatus).toBe('FAILED');
  });

  it('TC-W02c a malformed payload is kept as FAILED for later retry, not dropped', async () => {
    await deliver({ workflow_run: { id: 5 } }).expect(200);
    const event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event.processingStatus).toBe('FAILED');
    expect(event.errorMsg).toMatch(/missing required fields/);
  });

  it('TC-W03 rejects an invalid signature with 401 and stores nothing', async () => {
    await deliver(workflowRunPayload(), { secret: 'wrong-secret' }).expect(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.workflowRun.count()).toBe(0);
  });

  it('TC-W04 rejects a missing signature with 401', async () => {
    await deliver(workflowRunPayload(), { signature: '' }).expect(401);
    expect(await prisma.workflowRun.count()).toBe(0);
  });

  it('TC-W05 rejects events for a repository that has no webhook secret', async () => {
    await prisma.repository.update({ where: { id: org.repositoryId }, data: { webhookSecret: null } });
    await deliver(workflowRunPayload(), { signature: 'sha256=anything' }).expect(401);
    expect(await prisma.workflowRun.count()).toBe(0);
  });

  it('TC-W06 returns 400 when GitHub delivery headers are missing', async () => {
    await request(app.getHttpServer()).post(`${API}/webhooks/github/${org.repositoryId}`).send({}).expect(400);
  });

  it('TC-W07 processes a redelivered Delivery ID only once (idempotency)', async () => {
    const payload = workflowRunPayload();
    await deliver(payload, { deliveryId: 'same-delivery' }).expect(200);
    const second = await deliver(payload, { deliveryId: 'same-delivery' }).expect(200);

    expect(second.body.duplicate).toBe(true);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.workflowRun.count()).toBe(1);
  });

  it('TC-W08 handles concurrent duplicate deliveries without creating two events', async () => {
    const payload = workflowRunPayload();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => deliver(payload, { deliveryId: 'race-delivery' })),
    );

    results.forEach((r) => expect(r.status).toBe(200));
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.workflowRun.count()).toBe(1);
  });

  it('TC-W09 a late in_progress event does not roll back a completed run', async () => {
    await deliver(workflowRunPayload({ status: 'completed', conclusion: 'failure' })).expect(200);
    await deliver(workflowRunPayload({ status: 'in_progress', conclusion: null })).expect(200);
    await deliver(workflowRunPayload({ status: 'queued', conclusion: null })).expect(200);

    const run = await prisma.workflowRun.findFirstOrThrow();
    expect(run.status).toBe('COMPLETED');
    expect(run.conclusion).toBe('FAILURE');
  });

  it('TC-W10 events arriving in order advance the run status', async () => {
    await deliver(workflowRunPayload({ status: 'queued', conclusion: null })).expect(200);
    expect((await prisma.workflowRun.findFirstOrThrow()).status).toBe('QUEUED');

    await deliver(workflowRunPayload({ status: 'in_progress', conclusion: null })).expect(200);
    expect((await prisma.workflowRun.findFirstOrThrow()).status).toBe('IN_PROGRESS');

    await deliver(workflowRunPayload({ status: 'completed', conclusion: 'success' })).expect(200);
    const run = await prisma.workflowRun.findFirstOrThrow();
    expect(run.status).toBe('COMPLETED');
    expect(run.completedAt?.toISOString()).toBe('2026-10-13T08:02:30.000Z');
  });

  it('TC-W11 records a deployment_status event against the matching environment', async () => {
    await deliver(
      {
        deployment: {
          id: 555,
          sha: 'b'.repeat(40),
          environment: 'Production',
          created_at: '2026-10-13T09:00:00Z',
          creator: { login: 'octocat' },
        },
        deployment_status: { state: 'success', target_url: 'https://example.com' },
      },
      { event: 'deployment_status' },
    ).expect(200);

    const deployment = await prisma.deployment.findFirstOrThrow();
    expect(deployment).toMatchObject({
      status: 'SUCCESS',
      environmentId: org.environmentId,
      externalDeploymentId: '555',
    });
  });

  it('TC-W12 rejects payloads larger than the body limit', async () => {
    const huge = workflowRunPayload({ head_commit: { message: 'x'.repeat(2 * 1024 * 1024) } });
    const res = await deliver(huge);
    expect(res.status).toBe(413);
    expect(await prisma.workflowRun.count()).toBe(0);
  });
});
