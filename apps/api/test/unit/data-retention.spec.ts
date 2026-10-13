import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { DataRetentionService } from '../../src/data-retention/data-retention.service';

describe('DataRetentionService', () => {
  const previousRole = process.env.PROCESS_ROLE;
  const healthCheckDeleteMany = jest.fn();
  const webhookEventUpdateMany = jest.fn();
  const prisma = {
    healthCheck: { deleteMany: healthCheckDeleteMany },
    webhookEvent: { updateMany: webhookEventUpdateMany },
  } as unknown as PrismaService;
  const config = (values: Record<string, string | number> = {}) =>
    ({
      get: jest.fn((key: string, fallback: string | number) => values[key] ?? fallback),
    }) as unknown as ConfigService;

  beforeEach(() => {
    process.env.PROCESS_ROLE = 'worker';
    healthCheckDeleteMany.mockResolvedValue({ count: 0 });
    webhookEventUpdateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (previousRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = previousRole;
  });

  it('deletes checks older than 30 days and redacts only terminal webhook payloads older than 90 days', async () => {
    const service = new DataRetentionService(prisma, config());
    const startedAt = Date.now();

    await service.runRetention();

    const healthWhere = healthCheckDeleteMany.mock.calls[0][0].where;
    const webhookWhere = webhookEventUpdateMany.mock.calls[0][0].where;
    expect(healthWhere.checkedAt.lt.getTime()).toBeGreaterThanOrEqual(startedAt - 30 * 86_400_000 - 10);
    expect(healthWhere.checkedAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 30 * 86_400_000);
    expect(webhookWhere.receivedAt.lt.getTime()).toBeGreaterThanOrEqual(startedAt - 90 * 86_400_000 - 10);
    expect(webhookWhere.OR).toEqual([
      { processingStatus: 'PROCESSED' },
      { processingStatus: 'FAILED', nextAttemptAt: null },
    ]);
    expect(webhookEventUpdateMany.mock.calls[0][0].data.payload).toBe(Prisma.JsonNull);
  });

  it('uses configured retention periods', async () => {
    const service = new DataRetentionService(
      prisma,
      config({ HEALTH_CHECK_RETENTION_DAYS: 7, WEBHOOK_EVENT_RETENTION_DAYS: 14 }),
    );
    const startedAt = Date.now();

    await service.runRetention();

    expect(healthCheckDeleteMany.mock.calls[0][0].where.checkedAt.lt.getTime()).toBeGreaterThanOrEqual(
      startedAt - 7 * 86_400_000 - 10,
    );
    expect(webhookEventUpdateMany.mock.calls[0][0].where.receivedAt.lt.getTime()).toBeGreaterThanOrEqual(
      startedAt - 14 * 86_400_000 - 10,
    );
  });

  it('does not run on API-only processes', async () => {
    process.env.PROCESS_ROLE = 'api';
    const service = new DataRetentionService(prisma, config());

    await service.runRetention();

    expect(healthCheckDeleteMany).not.toHaveBeenCalled();
    expect(webhookEventUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid retention periods', () => {
    expect(
      () => new DataRetentionService(prisma, config({ HEALTH_CHECK_RETENTION_DAYS: 0 })),
    ).toThrow('HEALTH_CHECK_RETENTION_DAYS must be a positive integer number of days.');
    expect(
      () => new DataRetentionService(prisma, config({ WEBHOOK_EVENT_RETENTION_DAYS: '30d' })),
    ).toThrow('WEBHOOK_EVENT_RETENTION_DAYS must be a positive integer number of days.');
  });
});
