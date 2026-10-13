import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ProjectsModule } from './projects/projects.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { WorkflowRunsModule } from './workflow-runs/workflow-runs.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { HealthChecksModule } from './health-checks/health-checks.module';
import { IncidentsModule } from './incidents/incidents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 10000, limit: 100 },
      { name: 'long', ttl: 60000, limit: 300 },
    ]),

    // Cron jobs
    ScheduleModule.forRoot(),

    // Database
    PrismaModule,
    CryptoModule,

    // Feature modules
    AuthModule,
    OrganizationsModule,
    MembershipsModule,
    ProjectsModule,
    RepositoriesModule,
    WorkflowRunsModule,
    DeploymentsModule,
    HealthChecksModule,
    IncidentsModule,
    NotificationsModule,
    WebhooksModule,
    AuditLogsModule,

    // System health
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
