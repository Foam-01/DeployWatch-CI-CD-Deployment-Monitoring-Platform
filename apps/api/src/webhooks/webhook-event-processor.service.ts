import { Injectable, Logger } from '@nestjs/common';
import { DeploymentStatus, Repository, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotifierService } from '../notifications/notifier.service';
import { mapWorkflowConclusion, mapWorkflowStatus, shouldApplyStatus } from './workflow-run-state';

const STATUS_ORDER: WorkflowStatus[] = ['QUEUED', 'IN_PROGRESS', 'COMPLETED'];
const TERMINAL_DEPLOYMENT: DeploymentStatus[] = ['SUCCESS', 'FAILURE', 'CANCELLED', 'SKIPPED'];

/* eslint-disable @typescript-eslint/no-explicit-any -- GitHub payloads are validated field by field below */

@Injectable()
export class WebhookEventProcessorService {
  private readonly logger = new Logger(WebhookEventProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: NotifierService,
  ) {}

  async process(eventType: string, payload: any, repository: Repository) {
    switch (eventType) {
      case 'workflow_run':
        await this.processWorkflowRun(payload, repository);
        return this.notifyWorkflowFailure(payload, repository);
      case 'deployment_status':
        await this.processDeploymentStatus(payload, repository);
        return this.notifyDeploymentFailure(payload, repository);
      default:
        // 'ping' and other acknowledged events need no domain update.
        return;
    }
  }

  /** Emits once per failed run; the eventKey makes retries and redeliveries idempotent. */
  private async notifyWorkflowFailure(payload: any, repository: Repository) {
    const run = await this.prisma.workflowRun.findUnique({
      where: {
        repositoryId_externalRunId: { repositoryId: repository.id, externalRunId: BigInt(payload.workflow_run.id) },
      },
      include: { repository: { select: { project: { select: { organizationId: true, name: true } } } } },
    });
    if (!run || run.status !== 'COMPLETED' || !['FAILURE', 'TIMED_OUT'].includes(run.conclusion ?? '')) return;
    const firstLine = run.commitMessage?.split('\n')[0];
    await this.notifier.emit({
      organizationId: run.repository.project.organizationId,
      type: 'WORKFLOW_FAILURE',
      eventKey: `workflow_failure:${run.id}`,
      title: `${run.workflowName} #${run.runNumber} ${run.conclusion === 'TIMED_OUT' ? 'timed out' : 'failed'}`,
      body: `${run.repository.project.name} · ${run.branch ?? 'unknown branch'} · ${run.commitSha.slice(0, 7)}${firstLine ? ` — ${firstLine}` : ''}`,
      link: `/workflow-runs/${run.id}`,
    });
  }

  private async notifyDeploymentFailure(payload: any, repository: Repository) {
    const deployment = await this.prisma.deployment.findFirst({
      where: { externalDeploymentId: String(payload.deployment.id), projectId: repository.projectId },
      include: { environment: { select: { name: true } }, project: { select: { organizationId: true, name: true } } },
    });
    if (!deployment || deployment.status !== 'FAILURE') return;
    await this.notifier.emit({
      organizationId: deployment.project.organizationId,
      type: 'DEPLOYMENT_FAILURE',
      eventKey: `deployment_failure:${deployment.id}`,
      title: `Deploy to ${deployment.environment.name} failed`,
      body: `${deployment.project.name} · ${deployment.commitSha.slice(0, 7)}${deployment.errorSummary ? ` — ${deployment.errorSummary}` : ''}`,
      link: `/deployments?projectId=${deployment.projectId}`,
    });
  }

  private async processWorkflowRun(payload: any, repository: Repository) {
    const run = payload?.workflow_run;
    if (!run || run.id === undefined || !run.head_sha || !run.html_url) {
      throw new Error('workflow_run payload is missing required fields.');
    }

    // run.id arrives as a JS number after JSON.parse. Beyond 2^53 it would already be
    // rounded, so refuse it rather than store a wrong ID that could collide with another run.
    if (!Number.isSafeInteger(run.id)) {
      throw new Error(`workflow_run id ${run.id} exceeds safe integer precision.`);
    }
    const externalRunId = BigInt(run.id);
    const status = mapWorkflowStatus(run.status);
    const conclusion = status === 'COMPLETED' ? mapWorkflowConclusion(run.conclusion) : null;
    const completedAt = status === 'COMPLETED' && run.updated_at ? new Date(run.updated_at) : null;
    const key = { repositoryId_externalRunId: { repositoryId: repository.id, externalRunId } };

    const existing = await this.prisma.workflowRun.findUnique({ where: key, select: { id: true, status: true } });

    if (!existing) {
      try {
        await this.prisma.workflowRun.create({
          data: {
            repositoryId: repository.id,
            externalRunId,
            runNumber: run.run_number,
            workflowName: run.name ?? 'workflow',
            status,
            conclusion,
            branch: run.head_branch ?? null,
            commitSha: run.head_sha,
            commitMessage: run.head_commit?.message?.slice(0, 2000) ?? null,
            triggeredBy: run.triggering_actor?.login ?? run.actor?.login ?? null,
            eventType: run.event ?? null,
            htmlUrl: run.html_url,
            startedAt: run.run_started_at ? new Date(run.run_started_at) : null,
            completedAt,
          },
        });
        return;
      } catch (err: any) {
        // Another delivery for the same run created it first — fall through to the update path.
        if (err?.code !== 'P2002') throw err;
      }
    }

    // Only move the run forward. The status filter makes this atomic: if a newer event
    // already advanced the row, this update matches nothing.
    const olderStatuses = STATUS_ORDER.filter((s) => shouldApplyStatus(s, status));
    if (olderStatuses.length === 0) return;

    const { count } = await this.prisma.workflowRun.updateMany({
      where: { repositoryId: repository.id, externalRunId, status: { in: olderStatuses } },
      data: {
        status,
        ...(conclusion && { conclusion }),
        ...(completedAt && { completedAt }),
        ...(run.run_started_at && { startedAt: new Date(run.run_started_at) }),
      },
    });
    if (count === 0) {
      this.logger.debug(`Ignored stale workflow_run ${externalRunId} event (${status}).`);
    }
  }

  private async processDeploymentStatus(payload: any, repository: Repository) {
    const deployment = payload?.deployment;
    const deploymentStatus = payload?.deployment_status;
    if (!deployment?.id || !deployment.environment || !deploymentStatus?.state) {
      throw new Error('deployment_status payload is missing required fields.');
    }

    const status = this.mapDeploymentStatus(deploymentStatus.state);
    const envSlug = String(deployment.environment).toLowerCase().replace(/\s+/g, '-');
    const environment = await this.prisma.environment.findFirst({
      where: { projectId: repository.projectId, slug: envSlug },
    });
    if (!environment) {
      throw new Error(`Environment "${deployment.environment}" is not configured for this project.`);
    }

    const externalDeploymentId = String(deployment.id);
    const existing = await this.prisma.deployment.findFirst({
      where: { externalDeploymentId, projectId: repository.projectId },
    });

    if (!existing) {
      await this.prisma.deployment.create({
        data: {
          projectId: repository.projectId,
          environmentId: environment.id,
          externalDeploymentId,
          status,
          commitSha: deployment.sha,
          triggeredBy: deployment.creator?.login ?? null,
          externalUrl: deploymentStatus.environment_url ?? deploymentStatus.target_url ?? null,
          errorSummary: status === 'FAILURE' ? deploymentStatus.description?.slice(0, 500) ?? null : null,
          startedAt: deployment.created_at ? new Date(deployment.created_at) : new Date(),
          completedAt: TERMINAL_DEPLOYMENT.includes(status) ? new Date(deploymentStatus.created_at ?? Date.now()) : null,
        },
      });
      return;
    }

    // A terminal deployment status is final; late in-progress events must not reopen it.
    if (TERMINAL_DEPLOYMENT.includes(existing.status)) return;

    await this.prisma.deployment.update({
      where: { id: existing.id },
      data: {
        status,
        ...(TERMINAL_DEPLOYMENT.includes(status) && {
          completedAt: new Date(deploymentStatus.created_at ?? Date.now()),
        }),
        ...(status === 'FAILURE' && { errorSummary: deploymentStatus.description?.slice(0, 500) ?? null }),
      },
    });
  }

  private mapDeploymentStatus(state: string): DeploymentStatus {
    const map: Record<string, DeploymentStatus> = {
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
