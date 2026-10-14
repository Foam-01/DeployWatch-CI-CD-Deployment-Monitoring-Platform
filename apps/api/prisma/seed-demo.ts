/**
 * Large, realistic DEMO dataset for manual testing (all data is fictional).
 *
 *   npm run db:seed:demo        (from the repository root)
 *
 * WARNING: deletes every row in the target database first, exactly like `db:seed`.
 *
 * Generates ~90 days of history: 2 organizations, 13 users across all roles,
 * 8 projects (GitHub, GitLab, Jenkins), thousands of workflow runs, deployments
 * per environment, 16 monitored services with health history, incidents with full
 * timelines, alert rules, notification channels + delivery history, in-app
 * notifications with per-user read state, webhook inbox events and audit logs.
 *
 * Random values come from a fixed seed, so every run produces the same dataset.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  AlertEventType,
  DeploymentStatus,
  IncidentEventType,
  IncidentSeverity,
  IncidentStatus,
  MemberRole,
  Prisma,
  PrismaClient,
  RepositoryProvider,
  ServiceStatus,
  WorkflowConclusion,
} from '@prisma/client';
import { SecretBox } from '../src/common/crypto/secret-box';

const prisma = new PrismaClient();
const box = new SecretBox(process.env.ENCRYPTION_KEY);

// ── Deterministic randomness ──────────────────────────────────────────────────
let rngState = 20261014;
function rand(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;
const sha = () => Array.from({ length: 40 }, () => '0123456789abcdef'[int(0, 15)]).join('');

const NOW = Date.now();
const DAY = 86_400_000;
const MIN = 60_000;
const DAYS_OF_HISTORY = 90;
const at = (msAgo: number) => new Date(NOW - msAgo);

/** createMany in chunks: Neon is far away, so fewer, larger round trips. */
async function insertMany<T>(label: string, rows: T[], fn: (chunk: T[]) => Promise<unknown>, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
  console.log(`  ${label.padEnd(26)} ${rows.length.toLocaleString()}`);
}

// ── Static catalogue ──────────────────────────────────────────────────────────
const PEOPLE: { email: string; name: string; role: MemberRole }[] = [
  { email: 'admin@deploywatch.dev', name: 'Alex Rivera (Lead DevOps)', role: 'OWNER' },
  { email: 'sarah@deploywatch.dev', name: 'Sarah Chen (Senior Backend)', role: 'ADMIN' },
  { email: 'mike@deploywatch.dev', name: 'Mike Tanaka (Platform)', role: 'ADMIN' },
  { email: 'priya@deploywatch.dev', name: 'Priya Patel (Frontend)', role: 'MEMBER' },
  { email: 'diego@deploywatch.dev', name: 'Diego Morales (Backend)', role: 'MEMBER' },
  { email: 'nok@deploywatch.dev', name: 'Nok Suwan (SRE)', role: 'MEMBER' },
  { email: 'emma@deploywatch.dev', name: 'Emma Novak (QA)', role: 'MEMBER' },
  { email: 'viewer@deploywatch.dev', name: 'Read Only', role: 'VIEWER' },
  { email: 'pm@deploywatch.dev', name: 'Jordan Lee (Product)', role: 'VIEWER' },
  { email: 'auditor@deploywatch.dev', name: 'Casey Brooks (Auditor)', role: 'VIEWER' },
];
const OTHER_ORG_PEOPLE: { email: string; name: string; role: MemberRole }[] = [
  { email: 'owner@globex.dev', name: 'Hank Scorpio (Globex)', role: 'OWNER' },
  { email: 'dev@globex.dev', name: 'Lena Fischer (Globex)', role: 'MEMBER' },
];
const GITHUB_ACTORS = ['alexr', 'schen', 'mtanaka', 'ppatel', 'dmorales', 'nsuwan', 'enovak', 'dependabot[bot]', 'renovate[bot]'];

interface ProjectDef {
  name: string;
  slug: string;
  description: string;
  provider: RepositoryProvider;
  repo: string;
  workflows: string[];
  runsPerDay: number;
  failRate: number;
  archived?: boolean;
  services: { name: string; url: string; env: 'production' | 'staging' | 'development'; profile: 'stable' | 'flaky' | 'down' | 'slow' }[];
}

const PROJECTS: ProjectDef[] = [
  {
    name: 'Storefront Web', slug: 'storefront-web', provider: 'GITHUB', repo: 'acme-cloud/storefront-web',
    description: 'Customer-facing Next.js storefront and checkout.',
    workflows: ['CI / Jest & Playwright', 'Deploy Production', 'Deploy Staging', 'Lighthouse Audit'],
    runsPerDay: 14, failRate: 0.1,
    services: [
      { name: 'Storefront Web Gateway', url: 'https://httpbin.org/status/200', env: 'production', profile: 'stable' },
      { name: 'Storefront Staging', url: 'https://httpbin.org/delay/1', env: 'staging', profile: 'slow' },
      { name: 'Image CDN', url: 'https://httpbin.org/get', env: 'production', profile: 'stable' },
    ],
  },
  {
    name: 'Payments Engine', slug: 'payments-engine', provider: 'GITHUB', repo: 'acme-cloud/payments-engine',
    description: 'Card authorization, refunds and settlement (PCI scope).',
    workflows: ['Build & Security Scan', 'Integration Tests', 'Deploy Production'],
    runsPerDay: 9, failRate: 0.16,
    services: [
      { name: 'Card Authorization Webhook API', url: 'https://httpbin.org/status/500', env: 'production', profile: 'down' },
      { name: 'Settlement Batch API', url: 'https://httpbin.org/status/200', env: 'production', profile: 'flaky' },
    ],
  },
  {
    name: 'Identity Service', slug: 'identity-service', provider: 'GITHUB', repo: 'acme-cloud/identity',
    description: 'OAuth2 / OIDC provider, sessions and MFA.',
    workflows: ['CI', 'CodeQL', 'Deploy Production', 'Deploy Staging'],
    runsPerDay: 8, failRate: 0.08,
    services: [
      { name: 'Auth API', url: 'https://httpbin.org/status/200', env: 'production', profile: 'stable' },
      { name: 'Auth API (staging)', url: 'https://httpbin.org/status/200', env: 'staging', profile: 'flaky' },
    ],
  },
  {
    name: 'Mobile Backend', slug: 'mobile-backend', provider: 'GITLAB', repo: 'acme-cloud/mobile-backend',
    description: 'GraphQL BFF for the iOS and Android apps.',
    workflows: ['pipeline: test', 'pipeline: build-image', 'pipeline: deploy'],
    runsPerDay: 7, failRate: 0.13,
    services: [
      { name: 'GraphQL Gateway', url: 'https://httpbin.org/status/200', env: 'production', profile: 'stable' },
      { name: 'Push Notification Worker', url: 'https://httpbin.org/status/200', env: 'production', profile: 'flaky' },
    ],
  },
  {
    name: 'Data Pipeline', slug: 'data-pipeline', provider: 'JENKINS', repo: 'acme-cloud/etl-pipeline',
    description: 'Nightly ETL into the analytics warehouse.',
    workflows: ['etl-nightly', 'etl-backfill', 'dbt-tests'],
    runsPerDay: 5, failRate: 0.2,
    services: [{ name: 'Warehouse Loader', url: 'https://httpbin.org/delay/2', env: 'production', profile: 'slow' }],
  },
  {
    name: 'Internal Admin', slug: 'internal-admin', provider: 'GITHUB', repo: 'acme-cloud/admin-console',
    description: 'Back-office console for support and finance.',
    workflows: ['CI', 'Deploy Production'],
    runsPerDay: 4, failRate: 0.07,
    services: [
      { name: 'Admin Console', url: 'https://httpbin.org/status/200', env: 'production', profile: 'stable' },
      { name: 'Admin API', url: 'https://httpbin.org/status/200', env: 'production', profile: 'stable' },
    ],
  },
  {
    name: 'Notifications Hub', slug: 'notifications-hub', provider: 'GITHUB', repo: 'acme-cloud/notifications-hub',
    description: 'Email, SMS and push fan-out service.',
    workflows: ['CI', 'Load Test', 'Deploy Production', 'Deploy Staging'],
    runsPerDay: 6, failRate: 0.11,
    services: [
      { name: 'Email Relay', url: 'https://httpbin.org/status/200', env: 'production', profile: 'flaky' },
      { name: 'SMS Gateway', url: 'https://httpbin.org/status/200', env: 'staging', profile: 'stable' },
    ],
  },
  {
    name: 'Legacy Monolith', slug: 'legacy-monolith', provider: 'JENKINS', repo: 'acme-cloud/legacy-monolith',
    description: 'Retired PHP monolith — archived, kept for history.',
    workflows: ['build', 'deploy'],
    runsPerDay: 2, failRate: 0.25, archived: true,
    services: [{ name: 'Legacy Portal', url: 'https://httpbin.org/status/200', env: 'production', profile: 'stable' }],
  },
];

const COMMIT_PREFIXES = ['feat', 'fix', 'chore', 'refactor', 'perf', 'test', 'docs', 'ci', 'build'];
const COMMIT_SUBJECTS = [
  'add idempotency key to checkout', 'handle null billing address', 'bump dependencies',
  'cache product catalogue for 60s', 'retry flaky payment provider call', 'split auth middleware',
  'tighten CSP headers', 'migrate to node 22', 'improve error messages on signup',
  'paginate order history', 'fix race in session refresh', 'remove dead feature flag',
  'add metrics for queue depth', 'speed up image resizing', 'upgrade prisma to 6.19',
  'drop legacy v1 endpoints', 'add e2e test for refunds', 'reduce bundle size by 18%',
  'fix timezone bug in reports', 'rotate signing keys', 'harden webhook signature check',
  'add rate limit to login', 'fix flaky test in cart spec', 'make health check cheaper',
];
const FAILURE_REASONS = [
  'Health check failed after rollout: /healthz returned 503',
  'Database migration timed out after 300s',
  'Image pull back-off: manifest unknown',
  'Smoke test failed: POST /checkout returned 500',
  'Rollout exceeded progress deadline',
  'Insufficient replicas available (2/4)',
];
const BRANCHES = ['main', 'main', 'main', 'develop', 'fix/discount-calc', 'feat/apple-pay', 'chore/deps', 'feat/mfa', 'release/2026.10'];
const EVENTS = ['push', 'push', 'push', 'pull_request', 'pull_request', 'schedule', 'workflow_dispatch'];

function commitMessage() {
  return `${pick(COMMIT_PREFIXES)}: ${pick(COMMIT_SUBJECTS)}`;
}
function conclusionFor(failRate: number): WorkflowConclusion {
  const r = rand();
  if (r < failRate) return 'FAILURE';
  if (r < failRate + 0.03) return 'CANCELLED';
  if (r < failRate + 0.045) return 'TIMED_OUT';
  if (r < failRate + 0.06) return 'SKIPPED';
  return 'SUCCESS';
}

async function wipe() {
  // Child tables first; organizations/users last.
  await prisma.$transaction([
    prisma.notificationRead.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationDelivery.deleteMany(),
    prisma.notificationChannel.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.alertRule.deleteMany(),
    prisma.incidentEvent.deleteMany(),
    prisma.incident.deleteMany(),
    prisma.healthCheck.deleteMany(),
    prisma.service.deleteMany(),
    prisma.deployment.deleteMany(),
    prisma.workflowRun.deleteMany(),
    prisma.repository.deleteMany(),
    prisma.environment.deleteMany(),
    prisma.project.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
}

async function main() {
  console.log('Seeding a large DEMO dataset (this replaces all existing data)…');
  await wipe();
  console.log('  existing data removed');

  const passwordHash = await bcrypt.hash('password123', 10);

  // ── Organizations & people ────────────────────────────────────────────────
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  await prisma.organization.createMany({
    data: [
      { id: orgId, name: 'Acme Cloud Platform', slug: 'acme-cloud', createdAt: at(120 * DAY) },
      { id: otherOrgId, name: 'Globex Corporation', slug: 'globex', createdAt: at(100 * DAY) },
    ],
  });

  const users = [...PEOPLE, ...OTHER_ORG_PEOPLE].map((p, i) => ({
    id: randomUUID(),
    email: p.email,
    name: p.name,
    passwordHash,
    createdAt: at((118 - i * 3) * DAY),
    role: p.role,
    orgId: i < PEOPLE.length ? orgId : otherOrgId,
  }));
  await insertMany('users', users, (c) =>
    prisma.user.createMany({ data: c.map(({ role: _r, orgId: _o, ...u }) => u) }),
  );
  await insertMany('memberships', users, (c) =>
    prisma.membership.createMany({
      data: c.map((u) => ({ organizationId: u.orgId, userId: u.id, role: u.role, createdAt: u.createdAt })),
    }),
  );
  const acmeUsers = users.filter((u) => u.orgId === orgId);
  const owner = acmeUsers[0];
  const writers = acmeUsers.filter((u) => u.role !== 'VIEWER');

  // ── Projects, environments, repositories ──────────────────────────────────
  const projectRows: Prisma.ProjectCreateManyInput[] = [];
  const envRows: Prisma.EnvironmentCreateManyInput[] = [];
  const repoRows: Prisma.RepositoryCreateManyInput[] = [];
  const projectCtx: {
    def: ProjectDef;
    id: string;
    repoId: string;
    envs: Record<'production' | 'staging' | 'development', string>;
  }[] = [];

  for (const [i, def] of PROJECTS.entries()) {
    const id = randomUUID();
    projectRows.push({
      id, organizationId: orgId, name: def.name, slug: def.slug, description: def.description,
      status: def.archived ? 'ARCHIVED' : 'ACTIVE', createdAt: at((110 - i * 4) * DAY),
    });
    const envs = { production: randomUUID(), staging: randomUUID(), development: randomUUID() };
    envRows.push(
      { id: envs.production, projectId: id, name: 'Production', slug: 'production', isProduction: true },
      { id: envs.staging, projectId: id, name: 'Staging', slug: 'staging', isProduction: false },
      { id: envs.development, projectId: id, name: 'Development', slug: 'development', isProduction: false },
    );
    const repoId = randomUUID();
    repoRows.push({
      id: repoId, projectId: id, provider: def.provider, externalRepoId: String(700000000 + i * 1013),
      fullName: def.repo, defaultBranch: 'main',
      webhookSecret: box.encrypt(`demo_webhook_secret_${def.slug}`),
      ...(def.provider === 'GITLAB' && {
        integrationUrl: 'https://gitlab.com', integrationToken: box.encrypt('glpat-DEMO-not-a-real-token'),
      }),
      ...(def.provider === 'JENKINS' && {
        integrationUrl: 'https://jenkins.example.com', integrationToken: box.encrypt('demo-user:DEMO-api-token'),
      }),
    });
    projectCtx.push({ def, id, repoId, envs });
  }
  // A second organization's project, to demo tenant isolation.
  const globexProjectId = randomUUID();
  projectRows.push({ id: globexProjectId, organizationId: otherOrgId, name: 'Globex Rocket Control', slug: 'rocket-control', description: 'Belongs to another organization — never visible to Acme users.' });
  envRows.push({ projectId: globexProjectId, name: 'Production', slug: 'production', isProduction: true });

  await insertMany('projects', projectRows, (c) => prisma.project.createMany({ data: c }));
  await insertMany('environments', envRows, (c) => prisma.environment.createMany({ data: c }));
  await insertMany('repositories', repoRows, (c) => prisma.repository.createMany({ data: c }));

  // ── Workflow runs & deployments ───────────────────────────────────────────
  const runRows: Prisma.WorkflowRunCreateManyInput[] = [];
  const deployRows: Prisma.DeploymentCreateManyInput[] = [];
  const webhookRows: Prisma.WebhookEventCreateManyInput[] = [];
  const failedRuns: { id: string; title: string; body: string; at: Date; projectName: string }[] = [];
  const failedDeploys: { id: string; title: string; body: string; at: Date; projectId: string }[] = [];
  let externalRunId = 18_000_000_000;
  let externalDeploymentId = 2_400_000_000;

  for (const p of projectCtx) {
    const days = p.def.archived ? 40 : DAYS_OF_HISTORY;
    const startOffset = p.def.archived ? 60 : 0; // archived project stopped 2 months ago
    let runNumber = 100;
    for (let d = days + startOffset; d > startOffset; d--) {
      const weekend = new Date(NOW - d * DAY).getUTCDay() % 6 === 0;
      const count = Math.max(0, Math.round(p.def.runsPerDay * (weekend ? 0.3 : 1) * (0.6 + rand() * 0.8)));
      for (let k = 0; k < count; k++) {
        const createdAt = at(d * DAY - int(0, DAY - 10 * MIN));
        const workflowName = pick(p.def.workflows);
        const isDeploy = /deploy/i.test(workflowName);
        const branch = isDeploy ? 'main' : pick(BRANCHES);
        const durationSec = isDeploy ? int(120, 600) : int(45, 900);
        const conclusion = conclusionFor(p.def.failRate);
        const id = randomUUID();
        const commitSha = sha();
        const message = commitMessage();
        const actor = pick(GITHUB_ACTORS);
        externalRunId += int(1, 40);
        runNumber += 1;
        runRows.push({
          id, repositoryId: p.repoId, externalRunId: BigInt(externalRunId), runNumber, workflowName,
          status: 'COMPLETED', conclusion, branch, commitSha, commitMessage: message, triggeredBy: actor,
          eventType: isDeploy ? 'push' : pick(EVENTS),
          htmlUrl: `https://github.com/${p.def.repo}/actions/runs/${externalRunId}`,
          startedAt: createdAt, completedAt: new Date(createdAt.getTime() + durationSec * 1000), createdAt,
        });
        webhookRows.push({
          organizationId: orgId, repositoryId: p.repoId, provider: p.def.provider,
          deliveryId: randomUUID(), eventType: 'workflow_run',
          payload: { action: 'completed', workflow_run: { id: externalRunId, name: workflowName, conclusion: conclusion.toLowerCase() } },
          receivedAt: new Date(createdAt.getTime() + durationSec * 1000), processedAt: new Date(createdAt.getTime() + durationSec * 1000 + 800),
          processingStatus: 'PROCESSED', attemptCount: 1,
        });
        if (conclusion === 'FAILURE' || conclusion === 'TIMED_OUT') {
          failedRuns.push({
            id, at: createdAt, projectName: p.def.name,
            title: `${workflowName} #${runNumber} ${conclusion === 'TIMED_OUT' ? 'timed out' : 'failed'}`,
            body: `${p.def.name} · ${branch} · ${commitSha.slice(0, 7)} — ${message}`,
          });
        }

        // Successful deploy workflows produce a deployment; occasionally the rollout itself fails.
        if (isDeploy && conclusion === 'SUCCESS' && !p.def.archived) {
          const envKey = /staging/i.test(workflowName) ? 'staging' : chance(0.08) ? 'development' : 'production';
          const status: DeploymentStatus = chance(0.08) ? 'FAILURE' : chance(0.03) ? 'CANCELLED' : 'SUCCESS';
          const depId = randomUUID();
          externalDeploymentId += int(1, 9);
          const errorSummary = status === 'FAILURE' ? pick(FAILURE_REASONS) : null;
          deployRows.push({
            id: depId, projectId: p.id, environmentId: p.envs[envKey], workflowRunId: id,
            externalDeploymentId: String(externalDeploymentId), status, commitSha, commitMessage: message,
            triggeredBy: actor, errorSummary,
            externalUrl: envKey === 'production' ? `https://${p.def.slug}.acme.example` : `https://${envKey}.${p.def.slug}.acme.example`,
            startedAt: new Date(createdAt.getTime() + durationSec * 500),
            completedAt: new Date(createdAt.getTime() + durationSec * 1000),
            createdAt: new Date(createdAt.getTime() + durationSec * 500),
          });
          if (status === 'FAILURE') {
            failedDeploys.push({
              id: depId, at: createdAt, projectId: p.id,
              title: `Deploy to ${envKey === 'production' ? 'Production' : envKey === 'staging' ? 'Staging' : 'Development'} failed`,
              body: `${p.def.name} · ${commitSha.slice(0, 7)} — ${errorSummary}`,
            });
          }
        }
      }
    }
    // A few runs in flight right now on active projects.
    if (!p.def.archived) {
      for (const status of ['IN_PROGRESS', 'QUEUED'] as const) {
        if (!chance(0.7)) continue;
        externalRunId += 7;
        runNumber += 1;
        const createdAt = at(int(1, 12) * MIN);
        runRows.push({
          id: randomUUID(), repositoryId: p.repoId, externalRunId: BigInt(externalRunId), runNumber,
          workflowName: pick(p.def.workflows), status, branch: pick(BRANCHES), commitSha: sha(),
          commitMessage: commitMessage(), triggeredBy: pick(GITHUB_ACTORS), eventType: 'push',
          htmlUrl: `https://github.com/${p.def.repo}/actions/runs/${externalRunId}`,
          startedAt: status === 'IN_PROGRESS' ? createdAt : null, createdAt,
        });
      }
      const inFlightDeploy = randomUUID();
      deployRows.push({
        id: inFlightDeploy, projectId: p.id, environmentId: p.envs.staging, status: 'IN_PROGRESS',
        commitSha: sha(), commitMessage: commitMessage(), triggeredBy: pick(GITHUB_ACTORS),
        externalDeploymentId: String((externalDeploymentId += 3)), startedAt: at(int(2, 9) * MIN), createdAt: at(int(2, 9) * MIN),
      });
    }
  }
  await insertMany('workflow runs', runRows, (c) => prisma.workflowRun.createMany({ data: c }));
  await insertMany('deployments', deployRows, (c) => prisma.deployment.createMany({ data: c }));

  // Webhook inbox: processed events plus a few failures and retries to inspect.
  const recentRepo = projectCtx[1].repoId;
  webhookRows.push(
    {
      organizationId: orgId, repositoryId: recentRepo, provider: 'GITHUB', deliveryId: randomUUID(),
      eventType: 'deployment_status', payload: { deployment: { id: 1, environment: 'QA' }, deployment_status: { state: 'success' } },
      receivedAt: at(40 * MIN), processingStatus: 'FAILED', attemptCount: 2,
      errorMsg: 'Environment "QA" is not configured for this project.', nextAttemptAt: at(-25 * MIN),
    },
    {
      organizationId: orgId, repositoryId: recentRepo, provider: 'GITHUB', deliveryId: randomUUID(),
      eventType: 'workflow_run', payload: { workflow_run: { id: 5 } },
      receivedAt: at(3 * DAY), processingStatus: 'FAILED', attemptCount: 5,
      errorMsg: 'workflow_run payload is missing required fields.',
    },
  );
  await insertMany('webhook events', webhookRows, (c) => prisma.webhookEvent.createMany({ data: c }));

  // ── Services, health history, incidents ───────────────────────────────────
  const serviceRows: Prisma.ServiceCreateManyInput[] = [];
  const checkRows: Prisma.HealthCheckCreateManyInput[] = [];
  const incidentRows: Prisma.IncidentCreateManyInput[] = [];
  const incidentEventRows: Prisma.IncidentEventCreateManyInput[] = [];
  const incidentNotices: { id: string; title: string; at: Date; resolvedAt: Date | null; serviceId: string; serviceName: string }[] = [];
  const CHECK_EVERY = 30 * MIN;
  const CHECK_WINDOW = 7 * DAY; // detailed history kept for the last week

  for (const p of projectCtx) {
    for (const s of p.def.services) {
      const id = randomUUID();
      const failureThreshold = s.profile === 'flaky' ? 4 : 3;
      const base = s.profile === 'slow' ? 1400 : int(60, 220);
      const outages: [number, number][] = []; // [startAgo, endAgo]
      if (s.profile === 'flaky') for (let n = 0; n < 3; n++) { const st = int(1, 160) * CHECK_EVERY; outages.push([st, st - int(3, 6) * CHECK_EVERY]); }
      if (s.profile === 'down') outages.push([int(4, 7) * CHECK_EVERY, -1]);
      let lastOk = true;
      for (let ago = CHECK_WINDOW; ago >= 0; ago -= CHECK_EVERY) {
        const inOutage = outages.some(([st, en]) => ago <= st && ago > en);
        const blip = !inOutage && s.profile !== 'stable' && chance(0.02);
        const failing = inOutage || blip;
        const timeout = failing && chance(0.3);
        checkRows.push({
          serviceId: id, checkedAt: at(ago),
          status: failing ? (timeout ? 'TIMEOUT' : 'FAIL') : 'PASS',
          httpStatus: failing ? (timeout ? null : pick([500, 502, 503])) : 200,
          latencyMs: timeout ? 5000 : Math.round(base * (0.7 + rand() * 0.8) + (failing ? 900 : 0)),
          errorMsg: failing ? (timeout ? 'Request timed out after 5000ms' : 'Expected HTTP 200, got 503') : null,
        });
        lastOk = !failing;
      }
      const currentStatus: ServiceStatus = p.def.archived ? 'UNKNOWN' : s.profile === 'down' ? 'DOWN' : lastOk ? 'HEALTHY' : 'DEGRADED';
      serviceRows.push({
        id, projectId: p.id, environmentId: p.envs[s.env], name: s.name, healthUrl: s.url,
        intervalSeconds: s.profile === 'slow' ? 600 : 300, timeoutMs: 5000, expectedHttpStatus: 200,
        failureThreshold, successThreshold: 2, currentStatus,
        consecutiveFailures: s.profile === 'down' ? 6 : 0, consecutiveSuccesses: s.profile === 'down' ? 0 : 12,
        lastCheckedAt: at(int(1, 9) * MIN), enabled: !p.def.archived,
      });

      // Incident history: past outages become resolved incidents with full timelines.
      const incidentCount = s.profile === 'stable' ? int(0, 1) : s.profile === 'slow' ? int(1, 2) : int(3, 6);
      for (let n = 0; n < incidentCount; n++) {
        const openedAgo = int(2, DAYS_OF_HISTORY - 1) * DAY + int(0, DAY);
        const incidentId = randomUUID();
        const openedAt = at(openedAgo);
        const durationMin = int(8, 240);
        const resolvedAt = new Date(openedAt.getTime() + durationMin * MIN);
        const severity: IncidentSeverity = pick(['CRITICAL', 'HIGH', 'HIGH', 'MEDIUM', 'LOW']);
        const title = pick([`Service Down: ${s.name}`, `${s.name} elevated 5xx error rate`, `${s.name} latency above SLO`, `${s.name} timeouts from health checker`]);
        incidentRows.push({
          id: incidentId, serviceId: id, title, severity, status: 'RESOLVED', openedAt, resolvedAt,
          description: `Automatic incident created after ${failureThreshold} consecutive failed health checks.`, createdAt: openedAt,
        });
        const responder = pick(writers);
        const timeline: [IncidentEventType, number, string, string | null][] = [
          ['OPENED', 0, `Service failed health check ${failureThreshold} times consecutively.`, null],
          ['ACKNOWLEDGED', int(2, 10), 'Incident acknowledged.', responder.id],
          ['INVESTIGATING', int(11, 20), pick(['Looking at the last deploy.', 'Upstream provider status page shows degradation.', 'Error spike correlates with connection pool exhaustion.']), responder.id],
          ['COMMENT', Math.max(21, durationMin - 5), 'Service health check passing again after 2 consecutive successes. Consider resolving this incident.', null],
          ['RESOLVED', durationMin, pick(['Rolled back to previous release.', 'Increased connection pool size and restarted pods.', 'Upstream recovered; added retry with backoff.', 'Rotated expired TLS certificate.']), responder.id],
        ];
        for (const [eventType, minAfter, message, actor] of timeline) {
          if (minAfter > durationMin && eventType !== 'RESOLVED') continue;
          incidentEventRows.push({ incidentId, eventType, message, actorUserId: actor, createdAt: new Date(openedAt.getTime() + minAfter * MIN) });
        }
        incidentNotices.push({ id: incidentId, title, at: openedAt, resolvedAt, serviceId: id, serviceName: s.name });
      }

      // Services that are down or degraded right now have an open incident.
      if (!p.def.archived && currentStatus !== 'HEALTHY') {
        const incidentId = randomUUID();
        const openedAt = at(s.profile === 'down' ? 2 * 60 * MIN : 25 * MIN);
        const status: IncidentStatus = s.profile === 'down' ? 'INVESTIGATING' : 'OPEN';
        const title = s.profile === 'down' ? `${s.name} elevated 5xx error rate` : `Service Down: ${s.name}`;
        incidentRows.push({
          id: incidentId, serviceId: id, title, severity: s.profile === 'down' ? 'CRITICAL' : 'HIGH', status, openedAt,
          description: `Automatic incident created after ${failureThreshold} consecutive failed health checks on ${s.url}.`, createdAt: openedAt,
        });
        incidentEventRows.push({ incidentId, eventType: 'OPENED', message: `Service failed health check ${failureThreshold} times consecutively.`, createdAt: openedAt });
        if (status === 'INVESTIGATING') {
          incidentEventRows.push(
            { incidentId, eventType: 'ACKNOWLEDGED', message: 'Paged the payments on-call.', actorUserId: acmeUsers[1].id, createdAt: new Date(openedAt.getTime() + 6 * MIN) },
            { incidentId, eventType: 'INVESTIGATING', message: 'Card processor returns 500 for all authorizations; opened a ticket with the provider.', actorUserId: acmeUsers[1].id, createdAt: new Date(openedAt.getTime() + 18 * MIN) },
          );
        }
        incidentNotices.push({ id: incidentId, title, at: openedAt, resolvedAt: null, serviceId: id, serviceName: s.name });
      }
    }
  }
  await insertMany('services', serviceRows, (c) => prisma.service.createMany({ data: c }));
  await insertMany('health checks', checkRows, (c) => prisma.healthCheck.createMany({ data: c }), 2000);
  await insertMany('incidents', incidentRows, (c) => prisma.incident.createMany({ data: c }));
  await insertMany('incident events', incidentEventRows, (c) => prisma.incidentEvent.createMany({ data: c }));

  // ── Alert rules ───────────────────────────────────────────────────────────
  const alertRows: Prisma.AlertRuleCreateManyInput[] = projectCtx
    .filter((_, i) => i % 2 === 0)
    .map((p) => ({ projectId: p.id, eventType: 'SERVICE_DOWN' as AlertEventType, enabled: true, config: { failureThreshold: p.def.failRate > 0.12 ? 2 : 5 } }));
  await insertMany('alert rules', alertRows, (c) => prisma.alertRule.createMany({ data: c }));

  // ── In-app notifications (most recent 45 days) ────────────────────────────
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const recent = (d: Date) => NOW - d.getTime() < 45 * DAY;
  for (const r of failedRuns.filter((x) => recent(x.at)))
    notifications.push({ id: randomUUID(), organizationId: orgId, eventKey: `workflow_failure:${r.id}`, eventType: 'WORKFLOW_FAILURE', title: r.title, body: r.body, link: `/workflow-runs/${r.id}`, createdAt: r.at });
  for (const dpl of failedDeploys.filter((x) => recent(x.at)))
    notifications.push({ id: randomUUID(), organizationId: orgId, eventKey: `deployment_failure:${dpl.id}`, eventType: 'DEPLOYMENT_FAILURE', title: dpl.title, body: dpl.body, link: `/deployments?projectId=${dpl.projectId}`, createdAt: dpl.at });
  for (const inc of incidentNotices.filter((x) => recent(x.at))) {
    notifications.push(
      { id: randomUUID(), organizationId: orgId, eventKey: `service_down:${inc.id}`, eventType: 'SERVICE_DOWN', title: `${inc.serviceName} is down`, body: 'Consecutive failed health checks', link: `/services/${inc.serviceId}`, createdAt: inc.at },
      { id: randomUUID(), organizationId: orgId, eventKey: `incident_opened:${inc.id}`, eventType: 'INCIDENT_OPENED', title: inc.title, body: 'Automatic incident created by the health checker.', link: `/incidents/${inc.id}`, createdAt: new Date(inc.at.getTime() + 1000) },
    );
    if (inc.resolvedAt) {
      notifications.push(
        { id: randomUUID(), organizationId: orgId, eventKey: `service_recovered:${inc.id}`, eventType: 'SERVICE_RECOVERED', title: `${inc.serviceName} recovered`, body: '2 consecutive passing checks.', link: `/incidents/${inc.id}`, createdAt: new Date(inc.resolvedAt.getTime() - 4 * MIN) },
        { id: randomUUID(), organizationId: orgId, eventKey: `incident_resolved:${inc.id}`, eventType: 'INCIDENT_RESOLVED', title: `Resolved: ${inc.title}`, body: null, link: `/incidents/${inc.id}`, createdAt: inc.resolvedAt },
      );
    }
  }
  await insertMany('in-app notifications', notifications, (c) => prisma.notification.createMany({ data: c }));

  // Read state differs per person; everything from the last ~2 days stays unread.
  const reads: Prisma.NotificationReadCreateManyInput[] = [];
  for (const n of notifications) {
    const age = NOW - (n.createdAt as Date).getTime();
    for (const u of acmeUsers) {
      if (age < 2 * DAY) continue;
      const diligence = u.role === 'OWNER' ? 0.95 : u.role === 'ADMIN' ? 0.85 : u.role === 'MEMBER' ? 0.6 : 0.3;
      if (chance(diligence)) reads.push({ notificationId: n.id as string, userId: u.id, readAt: new Date((n.createdAt as Date).getTime() + int(5, 600) * MIN) });
    }
  }
  await insertMany('notification reads', reads, (c) => prisma.notificationRead.createMany({ data: c }), 2000);

  // ── Notification channels + delivery history ──────────────────────────────
  // Channels are DISABLED so nothing is actually sent to these placeholder URLs.
  const channels = [
    { id: randomUUID(), name: '#devops-alerts (demo)', type: 'SLACK' as const, url: 'https://hooks.slack.com/services/T00000000/B00000000/DEMOALERTS', events: [] as AlertEventType[] },
    { id: randomUUID(), name: '#payments-oncall (demo)', type: 'SLACK' as const, url: 'https://hooks.slack.com/services/T00000000/B00000001/DEMOPAY', events: ['SERVICE_DOWN', 'INCIDENT_OPENED', 'INCIDENT_RESOLVED'] as AlertEventType[] },
    { id: randomUUID(), name: 'PagerDuty bridge (demo)', type: 'WEBHOOK' as const, url: 'https://events.example.com/deploywatch', events: ['SERVICE_DOWN', 'DEPLOYMENT_FAILURE'] as AlertEventType[] },
  ];
  await prisma.notificationChannel.createMany({
    data: channels.map((c, i) => ({
      id: c.id, organizationId: orgId, createdById: owner.id, name: c.name, type: c.type, events: c.events,
      enabled: false, configEncrypted: box.encrypt(JSON.stringify({ url: c.url })), createdAt: at((60 - i * 10) * DAY),
    })),
  });
  console.log(`  ${'notification channels'.padEnd(26)} ${channels.length}`);

  const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
  for (const n of notifications) {
    for (const c of channels) {
      if (c.events.length && !c.events.includes(n.eventType as AlertEventType)) continue;
      const created = (n.createdAt as Date).getTime();
      const roll = rand();
      const base = {
        channelId: c.id, idempotencyKey: `${c.id}:${n.eventKey}`, eventKey: n.eventKey as string,
        payload: { organizationId: orgId, type: n.eventType, eventKey: n.eventKey, title: n.title, body: n.body, link: n.link },
        createdAt: new Date(created),
      };
      if (roll < 0.86) {
        deliveries.push({ ...base, status: 'SENT', attemptCount: 1, lastAttemptAt: new Date(created + 2000), sentAt: new Date(created + 2400) });
      } else if (roll < 0.94) {
        deliveries.push({ ...base, status: 'SENT', attemptCount: 2, lastAttemptAt: new Date(created + 31_000), sentAt: new Date(created + 31_500), errorMsg: null });
      } else if (roll < 0.98) {
        deliveries.push({ ...base, status: 'FAILED', attemptCount: 5, lastAttemptAt: new Date(created + 8 * MIN), errorMsg: 'Destination responded with HTTP 503' });
      } else {
        deliveries.push({ ...base, status: 'FAILED', attemptCount: 1, lastAttemptAt: new Date(created + 2000), errorMsg: 'Destination responded with HTTP 404' });
      }
    }
  }
  await insertMany('notification deliveries', deliveries, (c) => prisma.notificationDelivery.createMany({ data: c }));

  // ── Audit log ─────────────────────────────────────────────────────────────
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  for (const u of acmeUsers.slice(1)) {
    audits.push({ organizationId: orgId, actorUserId: owner.id, action: 'CREATE', resourceType: 'membership', resourceId: randomUUID(), metadata: { email: u.email, role: u.role }, createdAt: u.createdAt });
  }
  for (const u of acmeUsers.filter((x) => x.role === 'MEMBER').slice(0, 2)) {
    audits.push({ organizationId: orgId, actorUserId: acmeUsers[1].id, action: 'UPDATE', resourceType: 'membership', resourceId: randomUUID(), metadata: { from: 'VIEWER', to: 'MEMBER' }, createdAt: at(int(20, 80) * DAY) });
  }
  for (const inc of incidentRows.filter((x) => x.status === 'RESOLVED')) {
    audits.push({ organizationId: orgId, actorUserId: pick(writers).id, action: 'UPDATE', resourceType: 'incident', resourceId: inc.id as string, metadata: { from: 'INVESTIGATING', to: 'RESOLVED' }, createdAt: inc.resolvedAt as Date });
  }
  for (const c of channels) {
    audits.push({ organizationId: orgId, actorUserId: owner.id, action: 'CREATE', resourceType: 'notification_channel', resourceId: c.id, metadata: { name: c.name, type: c.type }, createdAt: at(int(30, 60) * DAY) });
  }
  audits.push(
    { organizationId: orgId, actorUserId: owner.id, action: 'UPDATE', resourceType: 'organization', resourceId: orgId, metadata: { from: 'Acme Cloud', to: 'Acme Cloud Platform' }, createdAt: at(100 * DAY) },
    { organizationId: orgId, actorUserId: owner.id, action: 'ARCHIVE', resourceType: 'project', resourceId: projectCtx[7].id, metadata: { name: 'Legacy Monolith' }, createdAt: at(60 * DAY) },
  );
  await insertMany('audit log entries', audits, (c) => prisma.auditLog.createMany({ data: c }));

  console.log('\nDone. Sign in with any of these (password: password123):');
  for (const u of users) console.log(`  ${u.role.padEnd(7)} ${u.email}${u.orgId === otherOrgId ? '   (other organization)' : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
