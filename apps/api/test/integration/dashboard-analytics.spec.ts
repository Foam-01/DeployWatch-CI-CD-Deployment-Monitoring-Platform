import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { API, createMember, createOrgFixture, createTestApp, resetDatabase } from './helpers';

describe('Dashboard analytics (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const org = await createOrgFixture(prisma);
    token = (await createMember(app, prisma, org.orgId, 'OWNER')).token;

    const today = new Date();
    const twoDaysAgo = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 2, 12),
    );
    const tenDaysAgo = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 10, 12),
    );

    await Promise.all([
      prisma.workflowRun.create({
        data: {
          repositoryId: org.repositoryId,
          externalRunId: BigInt(1001),
          runNumber: 1,
          workflowName: 'CI',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          commitSha: 'a'.repeat(40),
          htmlUrl: 'https://github.com/acme/web/actions/runs/1001',
          createdAt: twoDaysAgo,
        },
      }),
      prisma.workflowRun.create({
        data: {
          repositoryId: org.repositoryId,
          externalRunId: BigInt(1002),
          runNumber: 2,
          workflowName: 'CI',
          status: 'COMPLETED',
          conclusion: 'FAILURE',
          commitSha: 'b'.repeat(40),
          htmlUrl: 'https://github.com/acme/web/actions/runs/1002',
          createdAt: twoDaysAgo,
        },
      }),
      prisma.workflowRun.create({
        data: {
          repositoryId: org.repositoryId,
          externalRunId: BigInt(1003),
          runNumber: 3,
          workflowName: 'CI',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          commitSha: 'c'.repeat(40),
          htmlUrl: 'https://github.com/acme/web/actions/runs/1003',
          createdAt: tenDaysAgo,
        },
      }),
      prisma.deployment.create({
        data: {
          projectId: org.projectId,
          environmentId: org.environmentId,
          status: 'SUCCESS',
          commitSha: 'd'.repeat(40),
          createdAt: twoDaysAgo,
        },
      }),
      prisma.deployment.create({
        data: {
          projectId: org.projectId,
          environmentId: org.environmentId,
          status: 'FAILURE',
          commitSha: 'e'.repeat(40),
          createdAt: twoDaysAgo,
        },
      }),
    ]);

    const otherOrg = await createOrgFixture(prisma);
    await Promise.all([
      prisma.workflowRun.create({
        data: {
          repositoryId: otherOrg.repositoryId,
          externalRunId: BigInt(2001),
          runNumber: 1,
          workflowName: 'Other organization',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          commitSha: 'f'.repeat(40),
          htmlUrl: 'https://github.com/other/web/actions/runs/2001',
          createdAt: twoDaysAgo,
        },
      }),
      prisma.deployment.create({
        data: {
          projectId: otherOrg.projectId,
          environmentId: otherOrg.environmentId,
          status: 'SUCCESS',
          commitSha: '1'.repeat(40),
          createdAt: twoDaysAgo,
        },
      }),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns zero-filled daily trends scoped to the organization and requested period', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/dashboard/analytics?days=7`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { data } = response.body;
    const twoDaysAgo = new Date();
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    const populatedDate = twoDaysAgo.toISOString().slice(0, 10);

    expect(data.periodDays).toBe(7);
    expect(data.workflowRuns).toHaveLength(7);
    expect(data.deployments).toHaveLength(7);
    expect(data.workflowRuns.find((point: { date: string }) => point.date === populatedDate)).toMatchObject({
      successes: 1,
      failures: 1,
    });
    expect(data.deployments.find((point: { date: string }) => point.date === populatedDate)).toMatchObject({
      successes: 1,
      failures: 1,
    });
    expect(data.workflowRuns.reduce((sum: number, point: { successes: number; failures: number }) =>
      sum + point.successes + point.failures, 0)).toBe(2);
    expect(data.deployments.reduce((sum: number, point: { successes: number; failures: number }) =>
      sum + point.successes + point.failures, 0)).toBe(2);
    expect(data.workflowRuns[0]).toMatchObject({ successes: 0, failures: 0 });
  });

  it('defaults to 30 days and rejects unsupported periods', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/dashboard/analytics`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.periodDays).toBe(30);
    expect(response.body.data.workflowRuns).toHaveLength(30);

    await request(app.getHttpServer())
      .get(`${API}/dashboard/analytics?days=8`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${API}/dashboard/analytics?days=invalid`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
