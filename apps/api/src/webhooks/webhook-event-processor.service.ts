import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class WebhookEventProcessorService {
  private readonly logger = new Logger(WebhookEventProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(eventId: string, eventType: string, payload: any, repository: any) {
    switch (eventType) {
      case 'workflow_run':
        await this.processWorkflowRun(payload, repository);
        break;
      case 'deployment_status':
        await this.processDeploymentStatus(payload, repository);
        break;
      case 'push':
        // Optional: track push events
        this.logger.debug(`Push event received for ${repository.fullName}`);
        break;
      default:
        this.logger.debug(`Unhandled event type: ${eventType}`);
    }
  }

  private async processWorkflowRun(payload: any, repository: any) {
    const run = payload.workflow_run;
    if (!run) return;

    const externalRunId = BigInt(run.id);
    const status = this.mapWorkflowStatus(run.status);
    const conclusion = run.conclusion ? this.mapWorkflowConclusion(run.conclusion) : undefined;

    // Upsert — handle out-of-order events carefully
    await this.prisma.workflowRun.upsert({
      where: {
        repositoryId_externalRunId: {
          repositoryId: repository.id,
          externalRunId,
        },
      },
      create: {
        repositoryId: repository.id,
        externalRunId,
        runNumber: run.run_number,
        workflowName: run.name,
        status,
        conclusion,
        branch: run.head_branch,
        commitSha: run.head_sha,
        commitMessage: run.head_commit?.message,
        triggeredBy: run.triggering_actor?.login,
        eventType: run.event,
        htmlUrl: run.html_url,
        startedAt: run.run_started_at ? new Date(run.run_started_at) : undefined,
        completedAt: conclusion ? new Date() : undefined,
      },
      update: {
        // Only update if the new status is more advanced (avoid overwriting COMPLETED with QUEUED)
        ...(status === 'COMPLETED'
          ? {
              status,
              conclusion,
              completedAt: new Date(),
            }
          : status === 'IN_PROGRESS'
          ? { status }
          : {}),
      },
    });

    this.logger.log(
      `WorkflowRun upserted: ${run.name} #${run.run_number} [${status}/${conclusion ?? '-'}]`,
    );
  }

  private async processDeploymentStatus(payload: any, repository: any) {
    const deployment = payload.deployment;
    const deploymentStatus = payload.deployment_status;
    if (!deployment || !deploymentStatus) return;

    const status = this.mapDeploymentStatus(deploymentStatus.state);
    const environment = await this.prisma.environment.findFirst({
      where: {
        projectId: repository.projectId,
        slug: deployment.environment.toLowerCase().replace(/\s+/g, '-'),
      },
    });

    if (!environment) {
      this.logger.warn(`Environment not found: ${deployment.environment}`);
      return;
    }

    const existing = await this.prisma.deployment.findFirst({
      where: { externalDeploymentId: String(deployment.id), projectId: repository.projectId },
    });

    if (existing) {
      await this.prisma.deployment.update({
        where: { id: existing.id },
        data: {
          status,
          completedAt: ['SUCCESS', 'FAILURE', 'CANCELLED'].includes(status) ? new Date() : undefined,
        },
      });
    } else {
      await this.prisma.deployment.create({
        data: {
          projectId: repository.projectId,
          environmentId: environment.id,
          externalDeploymentId: String(deployment.id),
          status,
          commitSha: deployment.sha,
          triggeredBy: deployment.creator?.login,
          externalUrl: deploymentStatus.target_url,
          startedAt: new Date(deployment.created_at),
        },
      });
    }

    this.logger.log(`Deployment ${deployment.id} status: ${status}`);
  }

  private mapWorkflowStatus(status: string): 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' {
    switch (status) {
      case 'queued':
      case 'waiting':
        return 'QUEUED';
      case 'in_progress':
        return 'IN_PROGRESS';
      case 'completed':
        return 'COMPLETED';
      default:
        return 'QUEUED';
    }
  }

  private mapWorkflowConclusion(conclusion: string) {
    const map: Record<string, any> = {
      success: 'SUCCESS',
      failure: 'FAILURE',
      cancelled: 'CANCELLED',
      skipped: 'SKIPPED',
      timed_out: 'TIMED_OUT',
      action_required: 'ACTION_REQUIRED',
    };
    return map[conclusion] ?? 'FAILURE';
  }

  private mapDeploymentStatus(state: string): any {
    const map: Record<string, any> = {
      pending: 'QUEUED',
      queued: 'QUEUED',
      in_progress: 'IN_PROGRESS',
      success: 'SUCCESS',
      failure: 'FAILURE',
      error: 'FAILURE',
      inactive: 'CANCELLED',
    };
    return map[state] ?? 'IN_PROGRESS';
  }
}
