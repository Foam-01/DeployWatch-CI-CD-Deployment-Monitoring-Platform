import { PrismaClient, MemberRole, ProjectStatus, RepositoryProvider, WorkflowStatus, WorkflowConclusion, DeploymentStatus, ServiceStatus, HealthCheckStatus, IncidentSeverity, IncidentStatus, IncidentEventType, NotificationChannelType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting DeployWatch database seed...');

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notificationChannel.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.incidentEvent.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.healthCheck.deleteMany();
  await prisma.service.deleteMany();
  await prisma.deployment.deleteMany();
  await prisma.workflowRun.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 1. Create Demo Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@deploywatch.dev',
      name: 'Alex Rivera (Lead DevOps)',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&fit=crop&crop=faces',
    },
  });

  const devUser = await prisma.user.create({
    data: {
      email: 'sarah@deploywatch.dev',
      name: 'Sarah Chen (Senior Backend)',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&fit=crop&crop=faces',
    },
  });

  console.log('✅ Created users: admin@deploywatch.dev and sarah@deploywatch.dev');

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Acme Cloud Platform',
      slug: 'acme-cloud',
    },
  });

  // Assign memberships
  await prisma.membership.create({
    data: {
      organizationId: org.id,
      userId: adminUser.id,
      role: MemberRole.OWNER,
    },
  });

  await prisma.membership.create({
    data: {
      organizationId: org.id,
      userId: devUser.id,
      role: MemberRole.ADMIN,
    },
  });

  // 3. Create Projects
  const storefrontProject = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'Storefront Web',
      slug: 'storefront-web',
      description: 'Customer facing e-commerce web storefront built with Next.js 14 and edge rendering',
      status: ProjectStatus.ACTIVE,
    },
  });

  const paymentProject = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'Payments Engine',
      slug: 'payments-engine',
      description: 'PCI-DSS compliant payment processing service and ledger engine',
      status: ProjectStatus.ACTIVE,
    },
  });

  // 4. Create Environments
  const sfProdEnv = await prisma.environment.create({
    data: {
      projectId: storefrontProject.id,
      name: 'Production',
      slug: 'production',
      isProduction: true,
    },
  });

  const sfStagingEnv = await prisma.environment.create({
    data: {
      projectId: storefrontProject.id,
      name: 'Staging',
      slug: 'staging',
      isProduction: false,
    },
  });

  const payProdEnv = await prisma.environment.create({
    data: {
      projectId: paymentProject.id,
      name: 'Production',
      slug: 'production',
      isProduction: true,
    },
  });

  // 5. Create Repositories
  const sfRepo = await prisma.repository.create({
    data: {
      projectId: storefrontProject.id,
      provider: RepositoryProvider.GITHUB,
      externalRepoId: '98273641',
      fullName: 'acme-cloud/storefront-web',
      defaultBranch: 'main',
      webhookSecret: 'whsec_storefront_demo_secret_2026',
    },
  });

  const payRepo = await prisma.repository.create({
    data: {
      projectId: paymentProject.id,
      provider: RepositoryProvider.GITHUB,
      externalRepoId: '98273642',
      fullName: 'acme-cloud/payments-engine',
      defaultBranch: 'main',
      webhookSecret: 'whsec_payments_demo_secret_2026',
    },
  });

  // 6. Workflow Runs & Deployments
  const now = new Date();

  // Workflow Run 1: Storefront - Success
  const run1 = await prisma.workflowRun.create({
    data: {
      repositoryId: sfRepo.id,
      externalRunId: BigInt(84729101),
      runNumber: 142,
      workflowName: 'Deploy Production',
      status: WorkflowStatus.COMPLETED,
      conclusion: WorkflowConclusion.SUCCESS,
      branch: 'main',
      commitSha: 'd9e4a8b7c312',
      commitMessage: 'feat(cart): implement one-click checkout Apple Pay integration',
      triggeredBy: 'alex-rivera',
      eventType: 'push',
      htmlUrl: 'https://github.com/acme-cloud/storefront-web/actions/runs/84729101',
      startedAt: new Date(now.getTime() - 25 * 60 * 1000),
      completedAt: new Date(now.getTime() - 21 * 60 * 1000),
    },
  });

  await prisma.deployment.create({
    data: {
      projectId: storefrontProject.id,
      environmentId: sfProdEnv.id,
      workflowRunId: run1.id,
      status: DeploymentStatus.SUCCESS,
      commitSha: 'd9e4a8b7c312',
      commitMessage: 'feat(cart): implement one-click checkout Apple Pay integration',
      triggeredBy: 'alex-rivera',
      externalUrl: 'https://storefront.acme.io',
      startedAt: new Date(now.getTime() - 24 * 60 * 1000),
      completedAt: new Date(now.getTime() - 21 * 60 * 1000),
    },
  });

  // Workflow Run 2: Storefront - Failure
  const run2 = await prisma.workflowRun.create({
    data: {
      repositoryId: sfRepo.id,
      externalRunId: BigInt(84729102),
      runNumber: 143,
      workflowName: 'CI / Jest & Playwright',
      status: WorkflowStatus.COMPLETED,
      conclusion: WorkflowConclusion.FAILURE,
      branch: 'fix/discount-calc',
      commitSha: 'a12bc890e74f',
      commitMessage: 'fix(discount): resolve coupon code rounding error on multi-currency items',
      triggeredBy: 'sarah-chen',
      eventType: 'pull_request',
      htmlUrl: 'https://github.com/acme-cloud/storefront-web/actions/runs/84729102',
      startedAt: new Date(now.getTime() - 15 * 60 * 1000),
      completedAt: new Date(now.getTime() - 12 * 60 * 1000),
    },
  });

  // Workflow Run 3: In Progress
  const run3 = await prisma.workflowRun.create({
    data: {
      repositoryId: payRepo.id,
      externalRunId: BigInt(84729103),
      runNumber: 88,
      workflowName: 'Build & Security Scan',
      status: WorkflowStatus.IN_PROGRESS,
      branch: 'main',
      commitSha: 'f87a19c5b20e',
      commitMessage: 'chore(deps): bump cryptographic hashing lib to latest CVE fix',
      triggeredBy: 'alex-rivera',
      eventType: 'push',
      htmlUrl: 'https://github.com/acme-cloud/payments-engine/actions/runs/84729103',
      startedAt: new Date(now.getTime() - 3 * 60 * 1000),
    },
  });

  await prisma.deployment.create({
    data: {
      projectId: paymentProject.id,
      environmentId: payProdEnv.id,
      workflowRunId: run3.id,
      status: DeploymentStatus.IN_PROGRESS,
      commitSha: 'f87a19c5b20e',
      commitMessage: 'chore(deps): bump cryptographic hashing lib to latest CVE fix',
      triggeredBy: 'alex-rivera',
      startedAt: new Date(now.getTime() - 3 * 60 * 1000),
    },
  });

  // 7. Services & Health Checks
  const healthyService = await prisma.service.create({
    data: {
      projectId: storefrontProject.id,
      environmentId: sfProdEnv.id,
      name: 'Storefront Web Gateway',
      healthUrl: 'https://httpbin.org/status/200',
      intervalSeconds: 60,
      expectedHttpStatus: 200,
      currentStatus: ServiceStatus.HEALTHY,
      consecutiveSuccesses: 12,
      consecutiveFailures: 0,
      lastCheckedAt: new Date(),
    },
  });

  // Add sample health checks
  for (let i = 10; i >= 0; i--) {
    await prisma.healthCheck.create({
      data: {
        serviceId: healthyService.id,
        status: HealthCheckStatus.PASS,
        httpStatus: 200,
        latencyMs: Math.floor(45 + Math.random() * 35),
        checkedAt: new Date(now.getTime() - i * 60 * 1000),
      },
    });
  }

  const degradedService = await prisma.service.create({
    data: {
      projectId: paymentProject.id,
      environmentId: payProdEnv.id,
      name: 'Card Authorization Webhook API',
      healthUrl: 'https://httpbin.org/status/500',
      intervalSeconds: 30,
      expectedHttpStatus: 200,
      currentStatus: ServiceStatus.DOWN,
      consecutiveFailures: 4,
      consecutiveSuccesses: 0,
      lastCheckedAt: new Date(),
    },
  });

  for (let i = 4; i >= 0; i--) {
    await prisma.healthCheck.create({
      data: {
        serviceId: degradedService.id,
        status: HealthCheckStatus.FAIL,
        httpStatus: 500,
        latencyMs: 520,
        errorMsg: 'HTTP 500 Internal Server Error returned by downstream upstream payment gateway',
        checkedAt: new Date(now.getTime() - i * 30 * 1000),
      },
    });
  }

  // 8. Create an Incident for the downed service
  const incident = await prisma.incident.create({
    data: {
      serviceId: degradedService.id,
      title: 'Payment Authorization API elevated 5xx error rate',
      description: 'Automated health checker reported 4 consecutive failed health checks on endpoint https://httpbin.org/status/500.',
      severity: IncidentSeverity.CRITICAL,
      status: IncidentStatus.OPEN,
      openedAt: new Date(now.getTime() - 10 * 60 * 1000),
    },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId: incident.id,
      eventType: IncidentEventType.OPENED,
      message: 'System auto-detected outage after failure threshold exceeded (4 failures)',
      createdAt: new Date(now.getTime() - 10 * 60 * 1000),
    },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId: incident.id,
      eventType: IncidentEventType.ACKNOWLEDGED,
      message: 'DevOps team paged. Investigating payment processor upstream network.',
      actorUserId: adminUser.id,
      createdAt: new Date(now.getTime() - 6 * 60 * 1000),
    },
  });

  // 9. Notification Channels
  await prisma.notificationChannel.create({
    data: {
      organizationId: org.id,
      createdById: adminUser.id,
      name: '#devops-deployments Slack Channel',
      type: NotificationChannelType.SLACK,
      configEncrypted: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXXX' }),
      enabled: true,
    },
  });

  await prisma.notificationChannel.create({
    data: {
      organizationId: org.id,
      createdById: adminUser.id,
      name: 'On-Call PagerDuty Email',
      type: NotificationChannelType.EMAIL,
      configEncrypted: JSON.stringify({ email: 'oncall@acme.io' }),
      enabled: true,
    },
  });

  console.log('🎉 DeployWatch seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
