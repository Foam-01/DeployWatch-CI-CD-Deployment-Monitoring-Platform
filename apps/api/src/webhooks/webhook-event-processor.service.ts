import { Injectable, Logger } from '@nestjs/common';
import { DeploymentStatus, Repository, RepositoryProvider, WorkflowStatus } from '@prisma/client';
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
    if (repository.provider === RepositoryProvider.GITLAB) {
      const normalized = this.normalizeGitLabEvent(eventType, payload, repository);
      if (!normalized) return;
      eventType = normalized.eventType;
      payload = normalized.payload;
    } else if (repository.provider === RepositoryProvider.JENKINS) {
      const normalized = this.normalizeJenkinsEvent(eventType, payload, repository);
      if (!normalized) return;
      eventType = normalized.eventType;
      payload = normalized.payload;
    }

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

  async processSyncedWorkflowRun(workflowRun: Record<string, unknown>, repository: Repository) {
    const payload = { workflow_run: workflowRun };
    await this.processWorkflowRun(payload, repository);
    await this.notifyWorkflowFailure(payload, repository);
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

    const externalRunId = this.parseExternalRunId(run.id, repository.provider);
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

  private parseExternalRunId(value: unknown, provider: RepositoryProvider): bigint {
    if (provider === RepositoryProvider.GITHUB) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error('GitHub workflow_run id exceeds safe integer precision or is invalid.');
      }
      return BigInt(value);
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new Error('Provider workflow_run id exceeds safe integer precision.');
    }
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
      throw new Error('Provider workflow_run id must be a positive decimal integer.');
    }
    const id = BigInt(value);
    if (id <= 0n || id > 9_223_372_036_854_775_807n) {
      throw new Error('Provider workflow_run id must be a positive signed 64-bit integer.');
    }
    return id;
  }

  private normalizeGitLabEvent(eventType: string, payload: any, repository: Repository) {
    const kind = payload?.object_kind;
    const projectUrl = typeof payload?.project?.web_url === 'string' ? payload.project.web_url : null;
    if (kind === 'pipeline' || eventType === 'Pipeline Hook') {
      const pipeline = payload?.object_attributes;
      if (!pipeline || typeof pipeline !== 'object') {
        throw new Error('GitLab pipeline hook is missing its object attributes.');
      }
      const id = pipeline.id;
      const branch = pipeline.ref;
      const sha = pipeline.sha;
      if (
        id === undefined ||
        typeof branch !== 'string' ||
        !branch ||
        typeof sha !== 'string' ||
        !sha
      ) {
        throw new Error('GitLab pipeline hook is missing its ID, branch, or commit SHA.');
      }
      if (typeof id === 'number' && !Number.isSafeInteger(id)) {
        throw new Error('GitLab pipeline ID exceeds safe integer precision.');
      }
      const state = String(pipeline.status ?? '').toLowerCase();
      const status =
        state === 'running'
          ? 'in_progress'
          : ['created', 'pending', 'scheduled', 'manual', 'preparing', 'waiting_for_resource'].includes(state)
            ? 'queued'
            : 'completed';
      const conclusion: Record<string, string> = {
        success: 'success',
        failed: 'failure',
        canceled: 'cancelled',
        skipped: 'skipped',
      };
      const runNumber = Number(pipeline.iid ?? id);
      if (!Number.isSafeInteger(runNumber) || runNumber <= 0 || runNumber > 2_147_483_647) {
        throw new Error('GitLab pipeline IID is invalid.');
      }
      const projectBaseUrl =
        this.safeHttpsUrl(projectUrl, this.safeHttpsUrl(repository.integrationUrl, 'https://gitlab.com') ?? 'https://gitlab.com') ??
        'https://gitlab.com';
      return {
        eventType: 'workflow_run',
        payload: {
          workflow_run: {
            id: String(id),
            run_number: runNumber,
            name: String(payload.project?.name ?? repository.fullName),
            status,
            conclusion: status === 'completed' ? (conclusion[state] ?? 'failure') : null,
            head_branch: branch,
            head_sha: sha,
            html_url: this.safeHttpsUrl(
              pipeline.web_url,
              `${projectBaseUrl}/-/pipelines/${id}`,
            ),
            head_commit: { message: payload.commit?.message ?? null },
            triggering_actor: { login: payload.user?.username ?? null },
            run_started_at: pipeline.created_at ?? null,
            updated_at: pipeline.finished_at ?? pipeline.updated_at ?? null,
            event: 'pipeline',
          },
        },
      };
    }

    if (kind === 'deployment' || eventType === 'Deployment Hook') {
      const deployment = payload?.deployment ?? payload;
      if (!deployment || typeof deployment !== 'object') {
        throw new Error('GitLab deployment hook is missing its deployment details.');
      }
      const deployable = deployment.deployable ?? payload.deployable ?? {};
      const environment = deployment.environment ?? payload.environment ?? deployable.environment ?? {};
      const id =
        deployment.deployment_id ?? deployment.deploymentId ?? deployment.id ?? deployable.id ?? deployable.deployment_id;
      const environmentName = typeof environment === 'string' ? environment : environment.name;
      const sha = deployable.commit?.id ?? deployable.sha ?? deployable.commit_id;
      if (
        (typeof id !== 'string' && typeof id !== 'number') ||
        (typeof id === 'number' && !Number.isSafeInteger(id)) ||
        typeof environmentName !== 'string' ||
        !environmentName ||
        typeof sha !== 'string' ||
        !sha
      ) {
        throw new Error('GitLab deployment hook is missing its ID, environment, or commit SHA.');
      }
      const state = String(deployment.status ?? deployment.status_name ?? deployable.status ?? '').toLowerCase();
      const mappedState =
        state === 'success' || state === 'succeeded'
          ? 'success'
          : state === 'running'
            ? 'in_progress'
            : state === 'created'
              ? 'queued'
              : state === 'canceled'
                ? 'inactive'
                : 'failure';
      return {
        eventType: 'deployment_status',
        payload: {
          deployment: {
            id,
            sha,
            environment: environmentName,
            created_at: deployment.created_at ?? deployable.created_at,
            creator: { login: payload.user?.username ?? null },
          },
          deployment_status: {
            state: mappedState,
            created_at: deployment.updated_at ?? deployment.created_at ?? deployable.finished_at,
            description: deployable.name ?? null,
            environment_url: this.safeHttpsUrl(environment.external_url ?? environment.environment_url, null),
            target_url: this.safeHttpsUrl(deployable.web_url, null),
          },
        },
      };
    }
    return null;
  }

  private normalizeJenkinsEvent(eventType: string, payload: any, repository: Repository) {
    if (eventType === 'deployment') {
      const id = payload?.deployment_id ?? payload?.deploymentId;
      const environment = payload?.environment;
      const sha = payload?.git_commit ?? payload?.gitCommit ?? payload?.commit;
      const rawStatus = String(payload?.deployment_status ?? payload?.deploymentStatus ?? payload?.status ?? '').toUpperCase();
      if (
        id === undefined ||
        (typeof id !== 'string' && typeof id !== 'number') ||
        typeof environment !== 'string' ||
        !environment ||
        typeof sha !== 'string' ||
        !sha
      ) {
        throw new Error('Jenkins deployment event is missing its ID, environment, or commit SHA.');
      }
      const status: Record<string, string> = {
        SUCCESS: 'success',
        FAILURE: 'failure',
        FAILED: 'failure',
        RUNNING: 'in_progress',
        IN_PROGRESS: 'in_progress',
        QUEUED: 'queued',
        ABORTED: 'inactive',
      };
      return {
        eventType: 'deployment_status',
        payload: {
          deployment: {
            id,
            sha,
            environment,
            created_at: payload?.started_at ?? payload?.startedAt ?? payload?.timestamp,
            creator: { login: payload?.user ?? payload?.userName ?? null },
          },
          deployment_status: {
            state: status[rawStatus] ?? 'failure',
            created_at: payload?.completed_at ?? payload?.completedAt ?? payload?.timestamp,
            description: payload?.description ?? null,
            environment_url: this.safeHttpsUrl(
              payload?.deployment_url ??
                payload?.deploymentUrl ??
                payload?.environment_url ??
                payload?.environmentUrl,
              null,
            ),
            target_url: this.safeHttpsUrl(payload?.build_url ?? payload?.buildUrl ?? payload?.url, null),
          },
        },
      };
    }
    if (eventType !== 'build') return null;
    const id = payload?.build_number ?? payload?.buildNumber ?? payload?.number;
    const statusValue = String(payload?.build_status ?? payload?.buildStatus ?? payload?.result ?? '').toUpperCase();
    const buildUrl = payload?.build_url ?? payload?.buildUrl ?? payload?.url;
    const sha = payload?.git_commit ?? payload?.gitCommit ?? payload?.commit ?? payload?.GIT_COMMIT;
    if (id === undefined || typeof buildUrl !== 'string' || !buildUrl || typeof sha !== 'string' || !sha) {
      throw new Error('Jenkins build event is missing its number, URL, or commit SHA.');
    }
    const runNumber = Number(id);
    if (!Number.isSafeInteger(runNumber) || runNumber <= 0 || runNumber > 2_147_483_647) {
      throw new Error('Jenkins build number is invalid.');
    }
    const building = payload?.building === true || ['BUILDING', 'IN_PROGRESS', 'RUNNING'].includes(statusValue);
    const status = building ? 'in_progress' : 'completed';
    const conclusion =
      statusValue === 'SUCCESS'
        ? 'success'
        : statusValue === 'ABORTED'
          ? 'cancelled'
          : status === 'completed'
            ? 'failure'
            : null;
    const toIso = (value: unknown): string | null => {
      if (typeof value !== 'string' && typeof value !== 'number') return null;
      const date = new Date(typeof value === 'number' ? value : value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
    return {
      eventType: 'workflow_run',
      payload: {
        workflow_run: {
          id: String(id),
          run_number: runNumber,
          name: String(payload?.job_name ?? payload?.jobName ?? repository.fullName),
          status,
          conclusion,
          head_branch: payload?.git_branch ?? payload?.gitBranch ?? 'unknown',
          head_sha: String(sha),
          html_url: this.safeHttpsUrl(buildUrl, `${repository.integrationUrl ?? 'https://jenkins.invalid'}/`),
          head_commit: { message: payload?.commit_message ?? payload?.commitMessage ?? null },
          triggering_actor: { login: payload?.user ?? payload?.userName ?? null },
          run_started_at: toIso(payload?.timestamp ?? payload?.started_at ?? payload?.startedAt),
          updated_at:
            status === 'completed' ? toIso(payload?.completed_at ?? payload?.completedAt ?? payload?.timestamp) : null,
          event: 'jenkins',
        },
      },
    };
  }

  private safeHttpsUrl(value: unknown, fallback: string | null): string | null {
    if (typeof value !== 'string') return fallback;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : fallback;
    } catch {
      return fallback;
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
          errorSummary: status === 'FAILURE' ? (deploymentStatus.description?.slice(0, 500) ?? null) : null,
          startedAt: deployment.created_at ? new Date(deployment.created_at) : new Date(),
          completedAt: TERMINAL_DEPLOYMENT.includes(status)
            ? new Date(deploymentStatus.created_at ?? Date.now())
            : null,
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
