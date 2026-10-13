import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { API, TestOrg, createMember, createOrgFixture, createTestApp, resetDatabase, resetThrottling } from './helpers';

describe('Incident lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: TestOrg;
  let owner: { userId: string; token: string };
  let incidentId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    org = await createOrgFixture(prisma);
    owner = await createMember(app, prisma, org.orgId, 'OWNER');
    const service = await prisma.service.create({
      data: { projectId: org.projectId, name: 'API', healthUrl: 'https://api.example.com/health' },
    });
    incidentId = (
      await prisma.incident.create({
        data: { serviceId: service.id, title: 'API down', severity: 'CRITICAL', status: 'OPEN' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body?: object) =>
    request(app.getHttpServer())
      .post(`${API}${path}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(body ?? {});

  it('TC-L01 acknowledge then resolve records actor, time and reason on the timeline', async () => {
    await post(`/incidents/${incidentId}/acknowledge`).expect(201);
    await post(`/incidents/${incidentId}/resolve`, { message: 'Rolled back release 1.4.2' }).expect(201);

    const incident = await prisma.incident.findUniqueOrThrow({
      where: { id: incidentId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    expect(incident.status).toBe('RESOLVED');
    expect(incident.resolvedAt).not.toBeNull();
    expect(incident.events.map((e) => e.eventType)).toEqual(['ACKNOWLEDGED', 'RESOLVED']);
    expect(incident.events[1]).toMatchObject({ actorUserId: owner.userId, message: 'Rolled back release 1.4.2' });
  });

  it('TC-L02 resolving writes an audit log entry (spec critical case #7)', async () => {
    await post(`/incidents/${incidentId}/resolve`, { message: 'fixed' }).expect(201);

    const audit = await prisma.auditLog.findMany({ where: { resourceId: incidentId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      organizationId: org.orgId,
      actorUserId: owner.userId,
      resourceType: 'incident',
    });
  });

  it('TC-L03 an already resolved incident cannot be resolved again (409)', async () => {
    await post(`/incidents/${incidentId}/resolve`).expect(201);
    await post(`/incidents/${incidentId}/resolve`).expect(409);
    await post(`/incidents/${incidentId}/acknowledge`).expect(409);
    expect(await prisma.incidentEvent.count({ where: { incidentId } })).toBe(1);
  });

  it('TC-L04 archiving a project keeps its run and deployment history (spec critical case #8)', async () => {
    await prisma.workflowRun.create({
      data: {
        repositoryId: org.repositoryId,
        externalRunId: BigInt(7),
        runNumber: 7,
        workflowName: 'CI',
        status: 'COMPLETED',
        commitSha: 'e'.repeat(40),
        htmlUrl: 'https://github.com/a/a/actions/runs/7',
      },
    });
    await post(`/projects/${org.projectId}/archive`).expect(201);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: org.projectId } });
    expect(project.status).toBe('ARCHIVED');
    expect(await prisma.workflowRun.count()).toBe(1);
    expect(await prisma.incident.count()).toBe(1);
  });
});
