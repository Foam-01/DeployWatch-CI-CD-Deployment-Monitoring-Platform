import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { API, TestOrg, createMember, createOrgFixture, createTestApp, resetDatabase, resetThrottling } from './helpers';

/**
 * Organization isolation (IDOR) and role-based access control.
 * Spec critical cases #2 (org A cannot read org B) and #3 (viewer cannot mutate).
 */
describe('Access control (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: TestOrg;
  let orgB: TestOrg;
  let tokenA: string;
  let ids: { runB: string; deploymentB: string; serviceB: string; incidentB: string };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    orgA = await createOrgFixture(prisma);
    orgB = await createOrgFixture(prisma);
    tokenA = (await createMember(app, prisma, orgA.orgId, 'OWNER')).token;

    const runB = await prisma.workflowRun.create({
      data: {
        repositoryId: orgB.repositoryId,
        externalRunId: BigInt(1),
        runNumber: 1,
        workflowName: 'B secret workflow',
        status: 'COMPLETED',
        commitSha: 'c'.repeat(40),
        htmlUrl: 'https://github.com/b/b/actions/runs/1',
      },
    });
    const deploymentB = await prisma.deployment.create({
      data: { projectId: orgB.projectId, environmentId: orgB.environmentId, status: 'SUCCESS', commitSha: 'c'.repeat(40) },
    });
    const serviceB = await prisma.service.create({
      data: { projectId: orgB.projectId, name: 'B api', healthUrl: 'https://b.example.com/health' },
    });
    const incidentB = await prisma.incident.create({
      data: { serviceId: serviceB.id, title: 'B outage', severity: 'HIGH', status: 'OPEN' },
    });
    ids = { runB: runB.id, deploymentB: deploymentB.id, serviceB: serviceB.id, incidentB: incidentB.id };
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const asA = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    http()[method](`${API}${path}`).set('Authorization', `Bearer ${tokenA}`);

  describe('organization isolation', () => {
    it.each([
      ['project', () => `/projects/${orgB.projectId}`],
      ['project metrics', () => `/projects/${orgB.projectId}/metrics`],
      ['workflow run', () => `/workflow-runs/${ids.runB}`],
      ['deployment', () => `/deployments/${ids.deploymentB}`],
      ['service', () => `/services/${ids.serviceB}`],
      ['service health history', () => `/services/${ids.serviceB}/health-history`],
      ['incident', () => `/incidents/${ids.incidentB}`],
      ['incident events', () => `/incidents/${ids.incidentB}/events`],
      ['repositories', () => `/projects/${orgB.projectId}/repositories`],
      ['project deployments', () => `/projects/${orgB.projectId}/deployments`],
      ['project services', () => `/projects/${orgB.projectId}/services`],
    ])('TC-I01 user in org A gets 404 for org B %s', async (_label, path) => {
      await asA('get', path()).expect(404);
    });

    it('TC-I02 list endpoints never include another organization’s data', async () => {
      const lists = await Promise.all([
        asA('get', '/projects').expect(200),
        asA('get', '/workflow-runs').expect(200),
        asA('get', '/deployments').expect(200),
        asA('get', '/services').expect(200),
        asA('get', '/incidents').expect(200),
      ]);
      const body = JSON.stringify(lists.map((r) => r.body));
      expect(body).not.toContain(orgB.projectId);
      expect(body).not.toContain('B secret workflow');
      expect(body).not.toContain('B outage');
    });

    it('TC-I03 the projectId filter cannot be used to read another org’s runs', async () => {
      const res = await asA('get', `/workflow-runs?projectId=${orgB.projectId}`).expect(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('TC-I04 cannot mutate another organization’s resources', async () => {
      await asA('post', `/incidents/${ids.incidentB}/resolve`).send({ message: 'x' }).expect(404);
      await asA('patch', `/projects/${orgB.projectId}`).send({ name: 'pwned' }).expect(404);
      await asA('patch', `/services/${ids.serviceB}`).send({ enabled: false }).expect(404);
      await asA('delete', `/projects/${orgB.projectId}/repositories/${orgB.repositoryId}`).expect(404);

      const incident = await prisma.incident.findUniqueOrThrow({ where: { id: ids.incidentB } });
      expect(incident.status).toBe('OPEN');
      expect((await prisma.project.findUniqueOrThrow({ where: { id: orgB.projectId } })).name).toBe('Web');
    });

    it('TC-I05 an X-Organization-Id header for an org the user is not in is refused', async () => {
      await asA('get', '/projects').set('X-Organization-Id', orgB.orgId).expect(404);
    });
  });

  describe('role-based access', () => {
    let viewer: string;
    let member: string;
    let incidentA: string;

    beforeEach(async () => {
      viewer = (await createMember(app, prisma, orgA.orgId, 'VIEWER')).token;
      member = (await createMember(app, prisma, orgA.orgId, 'MEMBER')).token;
      const service = await prisma.service.create({
        data: { projectId: orgA.projectId, name: 'A api', healthUrl: 'https://a.example.com/health' },
      });
      incidentA = (
        await prisma.incident.create({
          data: { serviceId: service.id, title: 'A outage', severity: 'HIGH', status: 'OPEN' },
        })
      ).id;
    });

    const as = (token: string, method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
      http()[method](`${API}${path}`).set('Authorization', `Bearer ${token}`);

    it('TC-R01 viewer can read but cannot create, edit or archive projects', async () => {
      await as(viewer, 'get', '/projects').expect(200);
      await as(viewer, 'post', '/projects').send({ name: 'New' }).expect(403);
      await as(viewer, 'patch', `/projects/${orgA.projectId}`).send({ name: 'Renamed' }).expect(403);
      await as(viewer, 'post', `/projects/${orgA.projectId}/archive`).expect(403);
    });

    it('TC-R02 viewer cannot acknowledge or resolve incidents', async () => {
      const res = await as(viewer, 'post', `/incidents/${incidentA}/resolve`).send({}).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      await as(viewer, 'post', `/incidents/${incidentA}/acknowledge`).expect(403);
      expect((await prisma.incident.findUniqueOrThrow({ where: { id: incidentA } })).status).toBe('OPEN');
    });

    it('TC-R03 only owners and admins manage repository integrations', async () => {
      const body = { fullName: 'acme/new-repo', externalRepoId: '123' };
      await as(viewer, 'post', `/projects/${orgA.projectId}/repositories`).send(body).expect(403);
      await as(member, 'post', `/projects/${orgA.projectId}/repositories`).send(body).expect(403);
      await asA('post', `/projects/${orgA.projectId}/repositories`).send(body).expect(201);
    });

    it('TC-R04 member can create projects and resolve incidents', async () => {
      await as(member, 'post', '/projects').send({ name: 'Member project' }).expect(201);
      await as(member, 'post', `/incidents/${incidentA}/resolve`).send({ message: 'fixed' }).expect(201);
    });
  });

  describe('secret handling', () => {
    it('TC-S01 webhook secret is returned once on creation and never again', async () => {
      const created = await asA('post', `/projects/${orgA.projectId}/repositories`)
        .send({ fullName: 'acme/api', externalRepoId: '987' })
        .expect(201);
      expect(created.body.data.webhookSecret).toMatch(/^[0-9a-f]{64}$/);

      const responses = await Promise.all([
        asA('get', `/projects/${orgA.projectId}`).expect(200),
        asA('get', `/projects/${orgA.projectId}/repositories`).expect(200),
        asA('get', `/projects/${orgA.projectId}/repositories/${created.body.data.id}`).expect(200),
        asA('get', '/projects').expect(200),
      ]);
      for (const res of responses) {
        const text = JSON.stringify(res.body);
        expect(text).not.toContain('webhookSecret');
        expect(text).not.toContain('integrationToken');
        expect(text).not.toContain(created.body.data.webhookSecret);
      }
    });

    it('TC-S02 password hashes never appear in API responses', async () => {
      const res = await asA('get', '/auth/me').expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    });

    it('TC-S03 error responses use the error contract and leak no stack trace', async () => {
      const res = await asA('get', '/workflow-runs/not-a-uuid').expect(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        requestId: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
    });
  });

  describe('pagination', () => {
    it('TC-P01 caps limit at 100 and paginates with a cursor without duplicates', async () => {
      await prisma.workflowRun.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          repositoryId: orgA.repositoryId,
          externalRunId: BigInt(1000 + i),
          runNumber: i,
          workflowName: 'CI',
          status: 'COMPLETED' as const,
          commitSha: 'd'.repeat(40),
          htmlUrl: 'https://github.com/a/a/actions/runs/1',
          createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
        })),
      });

      const capped = await asA('get', '/workflow-runs?limit=5000').expect(200);
      expect(capped.body.meta.pagination.limit).toBe(100);

      const page1 = await asA('get', '/workflow-runs?limit=10').expect(200);
      expect(page1.body.data).toHaveLength(10);
      expect(page1.body.meta.pagination.hasMore).toBe(true);

      const page2 = await asA('get', `/workflow-runs?limit=10&cursor=${page1.body.meta.pagination.cursor}`).expect(200);
      const page3 = await asA('get', `/workflow-runs?limit=10&cursor=${page2.body.meta.pagination.cursor}`).expect(200);
      expect(page3.body.data).toHaveLength(5);
      expect(page3.body.meta.pagination.hasMore).toBe(false);

      const all = [...page1.body.data, ...page2.body.data, ...page3.body.data].map((r: { id: string }) => r.id);
      expect(new Set(all).size).toBe(25);
    });
  });
});
