import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { API, TestOrg, createMember, createOrgFixture, createTestApp, resetDatabase, resetThrottling } from './helpers';

describe('CSV exports (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: TestOrg;
  let orgB: TestOrg;
  let tokenA: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    orgA = await createOrgFixture(prisma);
    orgB = await createOrgFixture(prisma);
    tokenA = (await createMember(app, prisma, orgA.orgId, 'OWNER')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const getAsA = (path: string) =>
    request(app.getHttpServer()).get(`${API}${path}`).set('Authorization', `Bearer ${tokenA}`);

  it('exports filtered, organization-scoped workflow runs as attachment CSV', async () => {
    await prisma.workflowRun.createMany({
      data: [
        {
          repositoryId: orgA.repositoryId,
          externalRunId: BigInt(101),
          runNumber: 101,
          workflowName: 'Build',
          status: 'COMPLETED',
          conclusion: 'FAILURE',
          branch: 'main',
          commitSha: 'a'.repeat(40),
          commitMessage: '=1+1',
          htmlUrl: 'https://github.com/acme/web/actions/runs/101',
        },
        {
          repositoryId: orgA.repositoryId,
          externalRunId: BigInt(102),
          runNumber: 102,
          workflowName: 'Deploy',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          commitSha: 'b'.repeat(40),
          htmlUrl: 'https://github.com/acme/web/actions/runs/102',
        },
        {
          repositoryId: orgB.repositoryId,
          externalRunId: BigInt(103),
          runNumber: 103,
          workflowName: 'Foreign private run',
          status: 'COMPLETED',
          conclusion: 'FAILURE',
          commitSha: 'c'.repeat(40),
          htmlUrl: 'https://github.com/acme/web/actions/runs/103',
        },
      ],
    });

    const response = await getAsA(`/workflow-runs/export.csv?conclusion=FAILURE&projectId=${orgA.projectId}`).expect(
      200,
    );

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('workflow-runs.csv');
    expect(response.text).toContain('"\'=1+1"');
    expect(response.text).toContain('"Build"');
    expect(response.text).not.toContain('Deploy');
    expect(response.text).not.toContain('Foreign private run');
  });

  it('exports filtered incidents without exposing another organization and validates filters', async () => {
    const serviceA = await prisma.service.create({
      data: {
        projectId: orgA.projectId,
        name: 'Checkout',
        healthUrl: 'https://a.example.com/health',
      },
    });
    const serviceB = await prisma.service.create({
      data: {
        projectId: orgB.projectId,
        name: 'Private service',
        healthUrl: 'https://b.example.com/health',
      },
    });
    await prisma.incident.createMany({
      data: [
        {
          serviceId: serviceA.id,
          title: '=cmd',
          severity: 'CRITICAL',
          status: 'OPEN',
        },
        {
          serviceId: serviceA.id,
          title: 'Resolved incident',
          severity: 'LOW',
          status: 'RESOLVED',
        },
        {
          serviceId: serviceB.id,
          title: 'Foreign private incident',
          severity: 'CRITICAL',
          status: 'OPEN',
        },
      ],
    });

    const response = await getAsA('/incidents/export.csv?status=OPEN&severity=CRITICAL').expect(200);

    expect(response.headers['content-disposition']).toContain('incidents.csv');
    expect(response.text).toContain('"\'=cmd"');
    expect(response.text).toContain('"Checkout"');
    expect(response.text).not.toContain('Resolved incident');
    expect(response.text).not.toContain('Foreign private incident');
    await getAsA('/incidents/export.csv?severity=INVALID').expect(400);
  });
});
