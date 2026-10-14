import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { API, TestOrg, createMember, createOrgFixture, createTestApp, resetDatabase } from './helpers';

describe('Deployment comparison (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: TestOrg;
  let otherOrg: TestOrg;
  let token: string;
  let secondEnvironmentId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    org = await createOrgFixture(prisma);
    otherOrg = await createOrgFixture(prisma);
    token = (await createMember(app, prisma, org.orgId, 'OWNER')).token;
    secondEnvironmentId = (
      await prisma.environment.create({
        data: { projectId: org.projectId, name: 'Staging', slug: 'staging' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const compare = (projectId: string, leftEnvironmentId: string, rightEnvironmentId: string) =>
    request(app.getHttpServer())
      .get(`${API}/projects/${projectId}/deployments/compare`)
      .query({ leftEnvironmentId, rightEnvironmentId })
      .set('Authorization', `Bearer ${token}`);

  it('returns each environment latest deployment and identifies matching commits', async () => {
    const recent = new Date();
    const older = new Date(recent.getTime() - 60_000);
    await prisma.deployment.createMany({
      data: [
        {
          projectId: org.projectId,
          environmentId: org.environmentId,
          status: 'SUCCESS',
          commitSha: 'older-commit',
          createdAt: older,
        },
        {
          projectId: org.projectId,
          environmentId: org.environmentId,
          status: 'SUCCESS',
          commitSha: 'shared-commit',
          createdAt: recent,
        },
        {
          projectId: org.projectId,
          environmentId: secondEnvironmentId,
          status: 'IN_PROGRESS',
          commitSha: 'shared-commit',
          createdAt: recent,
        },
      ],
    });

    const response = await compare(org.projectId, org.environmentId, secondEnvironmentId).expect(200);

    expect(response.body.data).toMatchObject({
      project: { id: org.projectId, name: 'Web' },
      left: {
        environment: { id: org.environmentId, name: 'Production', isProduction: true },
        deployment: { status: 'SUCCESS', commitSha: 'shared-commit' },
      },
      right: {
        environment: { id: secondEnvironmentId, name: 'Staging', isProduction: false },
        deployment: { status: 'IN_PROGRESS', commitSha: 'shared-commit' },
      },
      sameCommit: true,
    });
  });

  it('reports a different commit and handles an environment with no deployments', async () => {
    await prisma.deployment.create({
      data: {
        projectId: org.projectId,
        environmentId: org.environmentId,
        status: 'FAILURE',
        commitSha: 'production-commit',
      },
    });
    const response = await compare(org.projectId, org.environmentId, secondEnvironmentId).expect(200);
    expect(response.body.data.sameCommit).toBeNull();
    expect(response.body.data.right.deployment).toBeNull();

    await prisma.deployment.create({
      data: {
        projectId: org.projectId,
        environmentId: secondEnvironmentId,
        status: 'SUCCESS',
        commitSha: 'staging-commit',
      },
    });
    const different = await compare(org.projectId, org.environmentId, secondEnvironmentId).expect(200);
    expect(different.body.data.sameCommit).toBe(false);
  });

  it('does not compare environments outside the project or organization', async () => {
    await compare(org.projectId, org.environmentId, otherOrg.environmentId).expect(400);
    await compare(otherOrg.projectId, otherOrg.environmentId, org.environmentId).expect(404);
    await compare(org.projectId, org.environmentId, org.environmentId).expect(400);
  });
});
