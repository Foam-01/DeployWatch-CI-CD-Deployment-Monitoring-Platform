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

/** Members, audit log and organization settings: tenancy and role rules (spec §4 RBAC). */
describe('Organization administration (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: TestOrg;
  let orgB: TestOrg;
  let ownerA: { userId: string; token: string };
  let adminA: { userId: string; token: string };
  let viewerA: { userId: string; token: string };
  let ownerB: { userId: string; email: string; token: string };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
    orgA = await createOrgFixture(prisma);
    orgB = await createOrgFixture(prisma);
    ownerA = await createMember(app, prisma, orgA.orgId, 'OWNER');
    adminA = await createMember(app, prisma, orgA.orgId, 'ADMIN');
    viewerA = await createMember(app, prisma, orgA.orgId, 'VIEWER');
    ownerB = await createMember(app, prisma, orgB.orgId, 'OWNER');
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
    delete: (p: string) => request(app.getHttpServer()).delete(`${API}${p}`).set('Authorization', `Bearer ${token}`),
  });

  const membershipOf = (orgId: string, userId: string) =>
    prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgId, userId } } });

  describe('tenancy', () => {
    it('TC-O01 cannot list members or audit logs of another organization', async () => {
      await as(ownerA.token).get(`/organizations/${orgB.orgId}/memberships`).expect(404);
      await as(ownerA.token).get(`/organizations/${orgB.orgId}/audit-logs`).expect(404);
    });

    it('TC-O02 cannot add members to, or rename, another organization', async () => {
      const outsider = await prisma.user.create({ data: { email: 'x@example.test', name: 'X', passwordHash: 'x' } });
      await as(ownerA.token).post(`/organizations/${orgB.orgId}/memberships`, { email: outsider.email, role: 'OWNER' }).expect(404);
      await as(ownerA.token).patch(`/organizations/${orgB.orgId}`, { name: 'pwned' }).expect(404);
      expect(await prisma.membership.count({ where: { organizationId: orgB.orgId } })).toBe(1);
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgB.orgId } })).name).toBe('Org');
    });

    it('TC-O03 cannot change or remove a membership that belongs to another organization', async () => {
      const bMembership = await membershipOf(orgB.orgId, ownerB.userId);
      await as(ownerA.token).patch(`/organizations/${orgA.orgId}/memberships/${bMembership.id}`, { role: 'VIEWER' }).expect(404);
      await as(ownerA.token).delete(`/organizations/${orgA.orgId}/memberships/${bMembership.id}`).expect(404);
      expect((await membershipOf(orgB.orgId, ownerB.userId)).role).toBe('OWNER');
    });
  });

  describe('roles', () => {
    it('TC-O04 a viewer can list members but cannot promote themselves', async () => {
      await as(viewerA.token).get(`/organizations/${orgA.orgId}/memberships`).expect(200);
      const mine = await membershipOf(orgA.orgId, viewerA.userId);
      await as(viewerA.token).patch(`/organizations/${orgA.orgId}/memberships/${mine.id}`, { role: 'OWNER' }).expect(403);
      expect((await membershipOf(orgA.orgId, viewerA.userId)).role).toBe('VIEWER');
    });

    it('TC-O05 an admin can manage members but cannot grant OWNER or touch an owner', async () => {
      const viewer = await membershipOf(orgA.orgId, viewerA.userId);
      const owner = await membershipOf(orgA.orgId, ownerA.userId);
      await as(adminA.token).patch(`/organizations/${orgA.orgId}/memberships/${viewer.id}`, { role: 'MEMBER' }).expect(200);
      await as(adminA.token).patch(`/organizations/${orgA.orgId}/memberships/${viewer.id}`, { role: 'OWNER' }).expect(403);
      await as(adminA.token).patch(`/organizations/${orgA.orgId}/memberships/${owner.id}`, { role: 'VIEWER' }).expect(403);
      await as(adminA.token).delete(`/organizations/${orgA.orgId}/memberships/${owner.id}`).expect(403);
    });

    it('TC-O06 the last owner cannot be demoted or removed', async () => {
      const owner = await membershipOf(orgA.orgId, ownerA.userId);
      await as(ownerA.token).patch(`/organizations/${orgA.orgId}/memberships/${owner.id}`, { role: 'ADMIN' }).expect(409);
      await as(ownerA.token).delete(`/organizations/${orgA.orgId}/memberships/${owner.id}`).expect(409);
    });

    it('TC-O07 only the owner can rename the organization', async () => {
      await as(adminA.token).patch(`/organizations/${orgA.orgId}`, { name: 'Nope' }).expect(403);
      await as(ownerA.token).patch(`/organizations/${orgA.orgId}`, { name: 'Acme' }).expect(200);
    });

    it('TC-O08 audit log is visible to owners and admins only', async () => {
      await as(ownerA.token).get(`/organizations/${orgA.orgId}/audit-logs`).expect(200);
      await as(adminA.token).get(`/organizations/${orgA.orgId}/audit-logs`).expect(200);
      await as(viewerA.token).get(`/organizations/${orgA.orgId}/audit-logs`).expect(403);
    });
  });

  describe('validation and audit', () => {
    it('TC-O09 rejects an invalid role or email (400)', async () => {
      await as(ownerA.token).post(`/organizations/${orgA.orgId}/memberships`, { email: 'not-email', role: 'MEMBER' }).expect(400);
      await as(ownerA.token).post(`/organizations/${orgA.orgId}/memberships`, { email: 'a@b.test', role: 'GOD' }).expect(400);
    });

    it('TC-O10 adding, changing and removing a member are written to the audit log', async () => {
      const user = await prisma.user.create({ data: { email: 'new@example.test', name: 'New', passwordHash: 'x' } });
      const added = await as(ownerA.token)
        .post(`/organizations/${orgA.orgId}/memberships`, { email: 'NEW@example.test', role: 'VIEWER' })
        .expect(201);
      await as(ownerA.token).patch(`/organizations/${orgA.orgId}/memberships/${added.body.data.id}`, { role: 'MEMBER' }).expect(200);
      await as(ownerA.token).delete(`/organizations/${orgA.orgId}/memberships/${added.body.data.id}`).expect(200);

      const logs = await prisma.auditLog.findMany({ where: { organizationId: orgA.orgId, resourceType: 'membership' } });
      expect(logs.map((l) => l.action).sort()).toEqual(['CREATE', 'DELETE', 'UPDATE']);
      expect(logs.every((l) => l.actorUserId === ownerA.userId)).toBe(true);
      expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0);
    });
  });
});
