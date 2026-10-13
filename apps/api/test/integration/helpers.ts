import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MemberRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { APP_OPTIONS, configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

export const API = '/api/v1';
export const TEST_PASSWORD = 'correct-horse-battery';

/** Refuse to wipe anything that is not clearly a disposable test database. */
function assertTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const isLocal = ['localhost', '127.0.0.1', 'db-test'].includes(url.hostname);
  if (!isLocal || !url.pathname.includes('test')) {
    throw new Error(`Refusing to run integration tests against non-test database host "${url.hostname}".`);
  }
}

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  app.useLogger(false);
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/**
 * Clears rate-limit counters so one test's requests cannot throttle the next.
 * Rate limiting itself is still exercised by the tests that target it.
 */
export function resetThrottling(app: INestApplication) {
  (app.get(ThrottlerStorage) as ThrottlerStorageService).storage.clear();
}

export async function resetDatabase(prisma: PrismaService) {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  }
}

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export interface TestOrg {
  orgId: string;
  projectId: string;
  environmentId: string;
  repositoryId: string;
  webhookSecret: string;
}

/** Creates an organization with one project, a production environment and a linked repository. */
export async function createOrgFixture(prisma: PrismaService): Promise<TestOrg> {
  const org = await prisma.organization.create({ data: { name: 'Org', slug: unique('org') } });
  const project = await prisma.project.create({
    data: { organizationId: org.id, name: 'Web', slug: unique('web') },
  });
  const env = await prisma.environment.create({
    data: { projectId: project.id, name: 'Production', slug: 'production', isProduction: true },
  });
  const webhookSecret = crypto.randomBytes(16).toString('hex');
  const repo = await prisma.repository.create({
    data: {
      projectId: project.id,
      provider: 'GITHUB',
      externalRepoId: String(Date.now() + counter++),
      fullName: `acme/${unique('repo')}`,
      webhookSecret,
    },
  });
  return { orgId: org.id, projectId: project.id, environmentId: env.id, repositoryId: repo.id, webhookSecret };
}

/** Creates a user with the given role in `orgId` and returns a bearer token for them. */
export async function createMember(
  app: INestApplication,
  prisma: PrismaService,
  orgId: string,
  role: MemberRole,
): Promise<{ userId: string; email: string; token: string }> {
  const email = `${unique(role.toLowerCase())}@example.test`;
  const user = await prisma.user.create({
    data: { email, name: role, passwordHash: await bcrypt.hash(TEST_PASSWORD, 4) },
  });
  await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, role } });
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { userId: user.id, email, token: res.body.data.accessToken };
}

export function sign(body: string, secret: string) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Builds a GitHub workflow_run payload with overridable fields. */
export function workflowRunPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: 'completed',
    workflow_run: {
      id: 12_345_678_901,
      run_number: 42,
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
      event: 'push',
      html_url: 'https://github.com/acme/web/actions/runs/1',
      run_started_at: '2026-10-13T08:00:00Z',
      updated_at: '2026-10-13T08:02:30Z',
      head_commit: { message: 'feat: test' },
      triggering_actor: { login: 'octocat' },
      ...overrides,
    },
  };
}
