import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  API,
  TestOrg,
  createMember,
  createOrgFixture,
  createTestApp,
  resetDatabase,
  resetThrottling,
} from './helpers';

describe('Service health configuration (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: TestOrg;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    org = await createOrgFixture(prisma);
    token = (await createMember(app, prisma, org.orgId, 'ADMIN')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const create = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`${API}/projects/${org.projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'API', ...body });

  it.each([
    'http://127.0.0.1:5432/',
    'http://localhost/health',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/health',
    'http://[::1]/health',
    'file:///etc/passwd',
  ])('TC-H01 rejects health URL %s (SSRF)', async (healthUrl) => {
    const res = await create({ healthUrl }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.service.count()).toBe(0);
  });

  it('TC-H02 rejects changing an existing service to an internal URL', async () => {
    const service = await prisma.service.create({
      data: { projectId: org.projectId, name: 'API', healthUrl: 'https://example.com/health' },
    });
    await request(app.getHttpServer())
      .patch(`${API}/services/${service.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ healthUrl: 'http://169.254.169.254/' })
      .expect(400);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).healthUrl).toBe(
      'https://example.com/health',
    );
  });

  it('TC-H03 rejects out-of-range interval and timeout values', async () => {
    await create({ healthUrl: 'https://example.com/health', intervalSeconds: 1 }).expect(400);
    await create({ healthUrl: 'https://example.com/health', timeoutMs: 10 }).expect(400);
  });

  it('TC-H04 cannot attach a service to an environment from another organization', async () => {
    const other = await createOrgFixture(prisma);
    await create({ healthUrl: 'https://example.com/health', environmentId: other.environmentId }).expect(400);
    expect(await prisma.service.count()).toBe(0);
  });

  it('TC-E01 creates an environment whose slug matches GitHub deployment names; duplicates conflict', async () => {
    const post = (body: object) =>
      request(app.getHttpServer())
        .post(`${API}/projects/${org.projectId}/environments`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const res = await post({ name: 'Staging EU', isProduction: false }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Staging EU', slug: 'staging-eu', isProduction: false });
    await post({ name: 'Staging EU' }).expect(409);
    await post({ name: '<script>' }).expect(400);
  });

  it('TC-E02 an environment with deployment history cannot be deleted', async () => {
    await prisma.deployment.create({
      data: { projectId: org.projectId, environmentId: org.environmentId, status: 'SUCCESS', commitSha: 'a'.repeat(40) },
    });
    await request(app.getHttpServer())
      .delete(`${API}/projects/${org.projectId}/environments/${org.environmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(await prisma.deployment.count()).toBe(1);
  });

  it('TC-H05 rejects an out-of-range expected status and a non-http URL scheme', async () => {
    await create({ healthUrl: 'https://example.com/health', expectedHttpStatus: 42 }).expect(400);
    await create({ healthUrl: 'ftp://example.com/health' }).expect(400);
  });
});
