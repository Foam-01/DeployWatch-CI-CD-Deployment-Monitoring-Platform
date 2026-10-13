import { execSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@localhost:5433/deploywatch_test';

export const VIEWER = { email: 'viewer@deploywatch.dev', password: 'password123' };

/** Migrates and seeds the disposable test database, then adds a read-only user. */
export default async function globalSetup() {
  const url = new URL(TEST_DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.includes('test')) {
    throw new Error(`Refusing to seed non-test database host "${url.hostname}".`);
  }

  const apiDir = path.resolve(__dirname, '../../api');
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, ENCRYPTION_KEY: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' };
  execSync('npx prisma migrate deploy', { cwd: apiDir, env, stdio: 'inherit' });
  execSync('npx ts-node prisma/seed.ts', { cwd: apiDir, env, stdio: 'inherit' });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@deploywatch.dev' },
      include: { memberships: true },
    });
    const viewer = await prisma.user.create({
      data: { email: VIEWER.email, name: 'Read Only', passwordHash: admin.passwordHash },
    });
    await prisma.membership.create({
      data: { organizationId: admin.memberships[0].organizationId, userId: viewer.id, role: 'VIEWER' },
    });
  } finally {
    await prisma.$disconnect();
  }
}
