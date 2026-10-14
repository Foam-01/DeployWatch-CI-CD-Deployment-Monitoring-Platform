import '../test/integration/env';
import { performance } from 'node:perf_hooks';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createMember, createOrgFixture, createTestApp, resetDatabase } from '../test/integration/helpers';

const API = '/api/v1';
const TARGET_P95_MS = 500;
const WARMUP_REQUESTS = 5;
const MEASURED_REQUESTS = 30;
const REQUEST_INTERVAL_MS = 150;
const PROJECT_COUNT = 10;
const RUNS_PER_PROJECT = 2_000;
const DEPLOYMENTS_PER_PROJECT = 500;
const SERVICES_PER_PROJECT = 10;
const INCIDENT_COUNT = 50;
const INSERT_BATCH_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

interface BenchmarkResult {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(samples: number[], percentileRank: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil((percentileRank / 100) * sorted.length) - 1];
}

function summarize(samples: number[]): BenchmarkResult {
  return {
    p50Ms: Number(percentile(samples, 50).toFixed(2)),
    p95Ms: Number(percentile(samples, 95).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
  };
}

async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    await insert(rows.slice(offset, offset + INSERT_BATCH_SIZE));
  }
}

async function seedBenchmarkData(prisma: PrismaService) {
  const fixture = await createOrgFixture(prisma);
  const targets: Array<{ projectId: string; repositoryId: string; environmentId: string }> = [
    {
      projectId: fixture.projectId,
      repositoryId: fixture.repositoryId,
      environmentId: fixture.environmentId,
    },
  ];

  for (let index = 1; index < PROJECT_COUNT; index += 1) {
    const project = await prisma.project.create({
      data: {
        organizationId: fixture.orgId,
        name: `Benchmark project ${index + 1}`,
        slug: `benchmark-${Date.now()}-${index}`,
      },
    });
    const [environment, repository] = await Promise.all([
      prisma.environment.create({
        data: { projectId: project.id, name: 'Production', slug: 'production', isProduction: true },
      }),
      prisma.repository.create({
        data: {
          projectId: project.id,
          provider: 'GITHUB',
          externalRepoId: `benchmark-${Date.now()}-${index}`,
          fullName: `benchmark/project-${index + 1}`,
        },
      }),
    ]);
    targets.push({ projectId: project.id, repositoryId: repository.id, environmentId: environment.id });
  }

  const now = Date.now();
  for (let projectIndex = 0; projectIndex < targets.length; projectIndex += 1) {
    const target = targets[projectIndex];
    const runRows = Array.from({ length: RUNS_PER_PROJECT }, (_, rowIndex) => {
      const createdAt = new Date(now - ((projectIndex * RUNS_PER_PROJECT + rowIndex) % 90) * DAY_MS);
      return {
        repositoryId: target.repositoryId,
        externalRunId: BigInt(projectIndex * RUNS_PER_PROJECT + rowIndex + 1),
        runNumber: rowIndex + 1,
        workflowName: rowIndex % 2 === 0 ? 'CI' : 'Deploy',
        status: 'COMPLETED' as const,
        conclusion: rowIndex % 5 === 0 ? ('FAILURE' as const) : ('SUCCESS' as const),
        branch: 'main',
        commitSha: (projectIndex * RUNS_PER_PROJECT + rowIndex + 1).toString(16).padStart(40, '0'),
        htmlUrl: `https://github.com/benchmark/project-${projectIndex + 1}/actions/runs/${rowIndex + 1}`,
        createdAt,
        startedAt: createdAt,
        completedAt: new Date(createdAt.getTime() + 30_000),
      };
    });
    await insertInBatches(runRows, (batch) => prisma.workflowRun.createMany({ data: batch }));

    const deploymentRows = Array.from({ length: DEPLOYMENTS_PER_PROJECT }, (_, rowIndex) => {
      const createdAt = new Date(now - ((projectIndex * DEPLOYMENTS_PER_PROJECT + rowIndex) % 90) * DAY_MS);
      return {
        projectId: target.projectId,
        environmentId: target.environmentId,
        status: rowIndex % 5 === 0 ? ('FAILURE' as const) : ('SUCCESS' as const),
        commitSha: (PROJECT_COUNT * RUNS_PER_PROJECT + projectIndex * DEPLOYMENTS_PER_PROJECT + rowIndex)
          .toString(16)
          .padStart(40, '0'),
        commitMessage: rowIndex % 3 === 0 ? 'Benchmark deployment' : null,
        createdAt,
        startedAt: createdAt,
        completedAt: new Date(createdAt.getTime() + 45_000),
      };
    });
    await insertInBatches(deploymentRows, (batch) => prisma.deployment.createMany({ data: batch }));
  }

  const serviceRows = targets.flatMap((target, projectIndex) =>
    Array.from({ length: SERVICES_PER_PROJECT }, (_, serviceIndex) => ({
      projectId: target.projectId,
      name: `Benchmark service ${projectIndex + 1}-${serviceIndex + 1}`,
      healthUrl: `https://service-${projectIndex + 1}-${serviceIndex + 1}.example.test/health`,
      currentStatus: serviceIndex % 4 === 0 ? ('DEGRADED' as const) : ('HEALTHY' as const),
    })),
  );
  await prisma.service.createMany({ data: serviceRows });

  const services = await prisma.service.findMany({
    where: { project: { organizationId: fixture.orgId } },
    select: { id: true },
  });
  await prisma.incident.createMany({
    data: Array.from({ length: INCIDENT_COUNT }, (_, index) => ({
      serviceId: services[index % services.length].id,
      title: `Benchmark incident ${index + 1}`,
      severity: index % 4 === 0 ? ('CRITICAL' as const) : ('HIGH' as const),
      status: index % 3 === 0 ? ('RESOLVED' as const) : ('OPEN' as const),
      openedAt: new Date(now - index * DAY_MS),
    })),
  });

  return {
    fixture,
    dataset: {
      projects: PROJECT_COUNT,
      repositories: PROJECT_COUNT,
      workflowRuns: PROJECT_COUNT * RUNS_PER_PROJECT,
      deployments: PROJECT_COUNT * DEPLOYMENTS_PER_PROJECT,
      services: serviceRows.length,
      incidents: INCIDENT_COUNT,
      historyDays: 90,
    },
  };
}

async function main() {
  process.env.PROCESS_ROLE = 'api';
  const { app, prisma } = await createTestApp();

  try {
    await resetDatabase(prisma);
    const { fixture, dataset } = await seedBenchmarkData(prisma);
    const owner = await createMember(app, prisma, fixture.orgId, 'OWNER');
    const server = app.getHttpServer();

    for (const path of ['/dashboard', '/dashboard/analytics?days=30']) {
      await request(server).get(`${API}${path}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
    }

    const requestDuration = async (path: string) => {
      const startedAt = performance.now();
      await request(server).get(`${API}${path}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
      return performance.now() - startedAt;
    };

    for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
      await requestDuration('/dashboard');
      await requestDuration('/dashboard/analytics?days=30');
      await Promise.all([requestDuration('/dashboard'), requestDuration('/dashboard/analytics?days=30')]);
      await pause(REQUEST_INTERVAL_MS);
    }

    const overviewSamples: number[] = [];
    const analyticsSamples: number[] = [];
    const dashboardViewSamples: number[] = [];
    for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
      overviewSamples.push(await requestDuration('/dashboard'));
      analyticsSamples.push(await requestDuration('/dashboard/analytics?days=30'));
      const viewStartedAt = performance.now();
      await Promise.all([requestDuration('/dashboard'), requestDuration('/dashboard/analytics?days=30')]);
      dashboardViewSamples.push(performance.now() - viewStartedAt);
      await pause(REQUEST_INTERVAL_MS);
    }

    const results = {
      dashboardOverview: summarize(overviewSamples),
      dashboardAnalytics: summarize(analyticsSamples),
      dashboardViewConcurrent: summarize(dashboardViewSamples),
    };
    const report = {
      targetP95Ms: TARGET_P95_MS,
      samplesPerMetric: MEASURED_REQUESTS,
      warmupRequestsPerMetric: WARMUP_REQUESTS,
      dataset,
      environment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        database: 'disposable local PostgreSQL test database',
      },
      results,
    };

    console.log(JSON.stringify(report, null, 2));
    const missedBudgets = Object.entries(results).filter(([, result]) => result.p95Ms >= TARGET_P95_MS);
    if (missedBudgets.length > 0) {
      throw new Error(
        `Dashboard p95 target (< ${TARGET_P95_MS} ms) missed by: ${missedBudgets
          .map(([metric, result]) => `${metric}=${result.p95Ms} ms`)
          .join(', ')}`,
      );
    }
  } finally {
    try {
      await resetDatabase(prisma);
    } finally {
      await app.close();
    }
  }
}

main().catch((error: unknown) => {
  console.error('Dashboard performance benchmark failed:', error);
  process.exitCode = 1;
});
