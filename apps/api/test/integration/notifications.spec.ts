import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { SecretBox } from '../../src/common/crypto/secret-box';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { MAX_ATTEMPTS } from '../../src/common/utils/retry';
import { NotificationDispatcherService, OUTBOUND_HTTP } from '../../src/notifications/notification-dispatcher.service';
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

const SLACK_URL = 'https://hooks.slack.com/services/T1/B2/secret-token-123';

/**
 * Notifications end to end: event → in-app + queued delivery → dispatcher → status.
 * Outbound HTTP is replaced by a programmable fake so no request leaves the machine.
 */
describe('Notifications (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: NotificationDispatcherService;
  let org: TestOrg;
  let owner: { userId: string; token: string };
  let viewer: { userId: string; token: string };

  const sent: { url: string; payload: any }[] = [];
  let nextStatus: number[] = [];
  const fakePost = async (url: string, payload: unknown) => {
    sent.push({ url, payload });
    return { status: nextStatus.shift() ?? 200 };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp([{ provide: OUTBOUND_HTTP, useValue: fakePost }]));
    dispatcher = app.get(NotificationDispatcherService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    sent.length = 0;
    nextStatus = [];
    org = await createOrgFixture(prisma);
    owner = await createMember(app, prisma, org.orgId, 'OWNER');
    viewer = await createMember(app, prisma, org.orgId, 'VIEWER');
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (token: string) => ({
    get: (p: string) => request(app.getHttpServer()).get(`${API}${p}`).set('Authorization', `Bearer ${token}`),
    post: (p: string, b?: object) =>
      request(app.getHttpServer()).post(`${API}${p}`).set('Authorization', `Bearer ${token}`).send(b ?? {}),
    patch: (p: string, b: object) =>
      request(app.getHttpServer()).patch(`${API}${p}`).set('Authorization', `Bearer ${token}`).send(b),
  });
  const channels = () => `/organizations/${org.orgId}/notifications/channels`;

  async function addSlackChannel(events: string[] = []) {
    const res = await as(owner.token).post(channels(), { name: '#deploys', type: 'SLACK', url: SLACK_URL, events }).expect(201);
    return res.body.data.id as string;
  }

  function deliverFailedRun(deliveryId: string, runId = 777) {
    const body = JSON.stringify(workflowRunPayload({ id: runId, conclusion: 'failure' }));
    return request(app.getHttpServer())
      .post(`${API}/webhooks/github/${org.repositoryId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'workflow_run')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-Hub-Signature-256', sign(body, org.webhookSecret))
      .send(body)
      .expect(200);
  }

  describe('channels', () => {
    it('TC-N01 stores the destination encrypted and never returns it', async () => {
      const id = await addSlackChannel();
      const stored = await prisma.notificationChannel.findUniqueOrThrow({ where: { id } });
      expect(SecretBox.isEncrypted(stored.configEncrypted)).toBe(true);
      expect(stored.configEncrypted).not.toContain('secret-token');

      const list = await as(owner.token).get(channels()).expect(200);
      const text = JSON.stringify(list.body);
      expect(text).not.toContain('secret-token');
      expect(text).not.toContain('configEncrypted');
      expect(list.body.data[0].destination).toBe('https://hooks.slack.com/…-123');
    });

    it('TC-N02 rejects a "Slack" channel pointing anywhere but hooks.slack.com', async () => {
      await as(owner.token)
        .post(channels(), { name: 'x', type: 'SLACK', url: 'http://169.254.169.254/latest/meta-data' })
        .expect(400);
      await as(owner.token).post(channels(), { name: 'x', type: 'EMAIL', url: 'a@b.c' }).expect(400);
    });

    it('TC-N03 viewers cannot see or manage channels; other orgs cannot reach them', async () => {
      const id = await addSlackChannel();
      await as(viewer.token).get(channels()).expect(403);
      await as(viewer.token).post(channels(), { name: 'x', type: 'SLACK', url: SLACK_URL }).expect(403);

      const other = await createOrgFixture(prisma);
      const outsider = await createMember(app, prisma, other.orgId, 'OWNER');
      await as(outsider.token).patch(`/organizations/${other.orgId}/notifications/channels/${id}`, { enabled: false }).expect(404);
      await as(outsider.token).get(channels()).expect(404);
    });

    it('TC-N04 "Send test" really sends and reports the result', async () => {
      const id = await addSlackChannel();
      const ok = await as(owner.token).post(`${channels()}/${id}/test`).expect(200);
      expect(ok.body.data.status).toBe('SENT');
      expect(sent[0].url).toBe(SLACK_URL);
      expect(sent[0].payload.text).toContain('Test notification for #deploys');

      nextStatus = [404];
      const bad = await as(owner.token).post(`${channels()}/${id}/test`).expect(200);
      expect(bad.body.data).toMatchObject({ status: 'FAILED', errorMsg: 'Destination responded with HTTP 404' });
    });
  });

  describe('events and delivery', () => {
    it('TC-N05 a failed workflow creates one in-app notification and one delivery, even when redelivered', async () => {
      await addSlackChannel();
      await deliverFailedRun('d-1');
      await deliverFailedRun('d-2'); // GitHub redelivery / repeated completed event

      expect(await prisma.notification.count()).toBe(1);
      const n = await prisma.notification.findFirstOrThrow();
      expect(n).toMatchObject({ eventType: 'WORKFLOW_FAILURE', title: 'CI #42 failed' });
      expect(await prisma.notificationDelivery.count()).toBe(1);
    });

    it('TC-N06 a successful run notifies nobody', async () => {
      await addSlackChannel();
      const body = JSON.stringify(workflowRunPayload({ conclusion: 'success' }));
      await request(app.getHttpServer())
        .post(`${API}/webhooks/github/${org.repositoryId}`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'workflow_run')
        .set('X-GitHub-Delivery', 'ok-1')
        .set('X-Hub-Signature-256', sign(body, org.webhookSecret))
        .send(body)
        .expect(200);
      expect(await prisma.notification.count()).toBe(0);
    });

    it('TC-N07 channels only receive the events they subscribed to; disabled channels get nothing', async () => {
      await addSlackChannel(['SERVICE_DOWN']);
      const disabled = await addSlackChannel();
      await as(owner.token).patch(`${channels()}/${disabled}`, { enabled: false }).expect(200);

      await deliverFailedRun('d-1');
      expect(await prisma.notification.count()).toBe(1); // in-app always records it
      expect(await prisma.notificationDelivery.count()).toBe(0);
    });

    it('TC-N08 critical case #5: a failed send is retried with backoff and the history shows it', async () => {
      await addSlackChannel();
      await deliverFailedRun('d-1');

      nextStatus = [503];
      await dispatcher.dispatchDue();
      let d = await prisma.notificationDelivery.findFirstOrThrow();
      expect(d).toMatchObject({ status: 'FAILED', attemptCount: 1, errorMsg: 'Destination responded with HTTP 503' });
      expect(d.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

      expect(await dispatcher.dispatchDue()).toBe(0); // not due yet
      await prisma.notificationDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1) } });

      await dispatcher.dispatchDue();
      d = await prisma.notificationDelivery.findFirstOrThrow();
      expect(d).toMatchObject({ status: 'SENT', attemptCount: 2, errorMsg: null });
      expect(sent).toHaveLength(2);

      const history = await as(owner.token).get(`/organizations/${org.orgId}/notifications/deliveries`).expect(200);
      expect(history.body.data[0]).toMatchObject({ status: 'SENT', attemptCount: 2, title: 'CI #42 failed' });
    });

    it('TC-N09 permanent errors stop immediately; transient ones stop after the max attempts', async () => {
      await addSlackChannel();
      await deliverFailedRun('d-1');
      nextStatus = [400];
      await dispatcher.dispatchDue();
      expect((await prisma.notificationDelivery.findFirstOrThrow()).nextAttemptAt).toBeNull();

      await prisma.notificationDelivery.updateMany({
        data: { status: 'FAILED', attemptCount: MAX_ATTEMPTS - 1, nextAttemptAt: new Date(Date.now() - 1) },
      });
      nextStatus = [500];
      await dispatcher.dispatchDue();
      const d = await prisma.notificationDelivery.findFirstOrThrow();
      expect(d).toMatchObject({ status: 'FAILED', attemptCount: MAX_ATTEMPTS, nextAttemptAt: null });
    });

    it('TC-N10 two workers dispatching at once send each delivery exactly once', async () => {
      await addSlackChannel();
      for (let i = 0; i < 5; i++) await deliverFailedRun(`d-${i}`, 1000 + i);
      // Two independent claimers racing (bypassing the in-process guard).
      const claim = (n: number) => (dispatcher as unknown as { claim: (n: number) => Promise<string[]> }).claim(n);
      const [a, b] = await Promise.all([claim(5), claim(5)]);
      expect(a.length + b.length).toBe(5);
      expect(new Set([...a, ...b]).size).toBe(5);
      // Claimed rows are locked, so a third pass finds nothing to send.
      expect(await claim(5)).toEqual([]);
    });

    it('TC-N11 resolving an incident notifies', async () => {
      const service = await prisma.service.create({
        data: { projectId: org.projectId, name: 'API', healthUrl: 'https://api.example.com/health' },
      });
      const incident = await prisma.incident.create({
        data: { serviceId: service.id, title: 'API down', severity: 'HIGH', status: 'OPEN' },
      });
      await as(owner.token).post(`/incidents/${incident.id}/resolve`, { message: 'Rolled back' }).expect(201);
      const n = await prisma.notification.findFirstOrThrow();
      expect(n).toMatchObject({ eventType: 'INCIDENT_RESOLVED', title: 'Resolved: API down', link: `/incidents/${incident.id}` });
    });
  });

  describe('in-app feed', () => {
    it('TC-N12 read state is per user and scoped to the organization', async () => {
      await deliverFailedRun('d-1');
      await deliverFailedRun('d-2', 888);

      expect((await as(owner.token).get('/notifications/unread-count').expect(200)).body.data.count).toBe(2);
      const list = await as(owner.token).get('/notifications').expect(200);
      expect(list.body.data).toHaveLength(2);

      await as(owner.token).post('/notifications/read', { ids: [list.body.data[0].id] }).expect(200);
      expect((await as(owner.token).get('/notifications/unread-count')).body.data.count).toBe(1);
      expect((await as(viewer.token).get('/notifications/unread-count')).body.data.count).toBe(2);

      await as(owner.token).post('/notifications/read', {}).expect(200);
      expect((await as(owner.token).get('/notifications/unread-count')).body.data.count).toBe(0);
      expect((await as(owner.token).get('/notifications?unread=true')).body.data).toHaveLength(0);

      const other = await createOrgFixture(prisma);
      const outsider = await createMember(app, prisma, other.orgId, 'OWNER');
      expect((await as(outsider.token).get('/notifications')).body.data).toHaveLength(0);
    });
  });
});
