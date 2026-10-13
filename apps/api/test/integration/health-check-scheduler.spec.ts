jest.mock('../../src/health-checks/ssrf-guard', () => ({
  safeHttpGet: jest.fn().mockResolvedValue({ status: 503 }),
  TimeoutError: class TimeoutError extends Error {},
}));

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { HealthCheckSchedulerService } from '../../src/health-checks/health-check-scheduler.service';
import { createOrgFixture, createTestApp, resetDatabase } from './helpers';

describe('Project service-down alert rule runtime (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: HealthCheckSchedulerService;
  const previousRole = process.env.PROCESS_ROLE;

  beforeAll(async () => {
    process.env.PROCESS_ROLE = 'api';
    ({ app, prisma } = await createTestApp());
    scheduler = app.get(HealthCheckSchedulerService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    if (previousRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = previousRole;
  });

  async function runChecks() {
    process.env.PROCESS_ROLE = 'all';
    try {
      await scheduler.runHealthChecks();
    } finally {
      process.env.PROCESS_ROLE = 'api';
    }
  }

  it('uses the enabled project threshold instead of each service threshold', async () => {
    const org = await createOrgFixture(prisma);
    const service = await prisma.service.create({
      data: {
        projectId: org.projectId,
        name: 'API',
        healthUrl: 'https://example.com/health',
        intervalSeconds: 10,
        failureThreshold: 1,
        currentStatus: 'HEALTHY',
        lastCheckedAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.alertRule.create({
      data: {
        projectId: org.projectId,
        eventType: 'SERVICE_DOWN',
        enabled: true,
        config: { failureThreshold: 3 },
      },
    });

    for (let failures = 1; failures <= 3; failures += 1) {
      await prisma.service.update({
        where: { id: service.id },
        data: { lastCheckedAt: new Date(Date.now() - 60_000) },
      });
      await runChecks();
      const current = await prisma.service.findUniqueOrThrow({
        where: { id: service.id },
      });
      expect(current.consecutiveFailures).toBe(failures);
      expect(current.currentStatus).toBe(failures === 3 ? 'DOWN' : 'DEGRADED');
      expect(
        await prisma.incident.count({ where: { serviceId: service.id } }),
      ).toBe(failures === 3 ? 1 : 0);
    }

    const incident = await prisma.incident.findFirstOrThrow({
      where: { serviceId: service.id },
    });
    expect(incident.description).toContain(
      'after 3 consecutive failed health checks',
    );
  });

  it('uses the service threshold when no enabled project rule exists', async () => {
    const org = await createOrgFixture(prisma);
    const service = await prisma.service.create({
      data: {
        projectId: org.projectId,
        name: 'API',
        healthUrl: 'https://example.com/health',
        failureThreshold: 1,
        currentStatus: 'HEALTHY',
        lastCheckedAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.alertRule.create({
      data: {
        projectId: org.projectId,
        eventType: 'SERVICE_DOWN',
        enabled: false,
        config: { failureThreshold: 3 },
      },
    });

    await runChecks();

    const current = await prisma.service.findUniqueOrThrow({
      where: { id: service.id },
    });
    expect(current.currentStatus).toBe('DOWN');
    expect(
      await prisma.incident.count({ where: { serviceId: service.id } }),
    ).toBe(1);
  });
});
