import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RepositoryProvider } from '@prisma/client';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { DiscoverRepositoriesDto } from './dto/discover-repositories.dto';
import { SecretBox } from '../common/crypto/secret-box';
import { assertAllowedUrl, assertResolvesToPublicAddress, safeHttpGetJson } from '../health-checks/ssrf-guard';
import { WebhookEventProcessorService } from '../webhooks/webhook-event-processor.service';

/** Columns safe to return to clients — never includes webhook secrets or tokens. */
export const PUBLIC_REPOSITORY_SELECT = {
  id: true,
  projectId: true,
  provider: true,
  externalRepoId: true,
  fullName: true,
  defaultBranch: true,
  integrationUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly processor: WebhookEventProcessorService,
  ) {}

  private async assertProjectInOrg(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) throw new NotFoundException('Project not found.');
  }

  async findByProject(projectId: string, organizationId: string) {
    await this.assertProjectInOrg(projectId, organizationId);
    const repos = await this.prisma.repository.findMany({
      where: { projectId },
      select: { ...PUBLIC_REPOSITORY_SELECT, _count: { select: { workflowRuns: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: repos };
  }

  async findOne(id: string, projectId: string, organizationId: string) {
    const repo = await this.prisma.repository.findFirst({
      where: { id, projectId, project: { organizationId } },
      select: {
        ...PUBLIC_REPOSITORY_SELECT,
        workflowRuns: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!repo) throw new NotFoundException('Repository not found.');
    return { data: repo };
  }

  async discover(projectId: string, organizationId: string, dto: DiscoverRepositoriesDto) {
    await this.assertProjectInOrg(projectId, organizationId);
    const baseUrl = await this.validateIntegrationUrl(dto.integrationUrl);
    const headers = this.getAuthHeaders(dto.provider, dto.accessToken, dto.username);
    const endpoint =
      dto.provider === RepositoryProvider.GITLAB
        ? `${baseUrl}/api/v4/projects?membership=true&simple=true&per_page=100`
        : `${baseUrl}/api/json?tree=jobs[name,fullName,_class,jobs[name,fullName,_class,jobs[name,fullName,_class,jobs[name,fullName,_class]{0,100}]{0,100}]{0,100}]{0,100}`;
    const response = await this.getJson(endpoint, headers);
    if (dto.provider === RepositoryProvider.GITLAB) {
      if (!Array.isArray(response)) throw new BadGatewayException('GitLab returned an invalid project list.');
      return {
        data: response.map((project: unknown) => {
          if (!project || typeof project !== 'object')
            throw new BadGatewayException('GitLab returned an invalid project.');
          const item = project as Record<string, unknown>;
          const fullName = item.path_with_namespace ?? item.name;
          if (
            (typeof item.id !== 'string' && typeof item.id !== 'number') ||
            (typeof item.id === 'number' && !Number.isSafeInteger(item.id)) ||
            typeof fullName !== 'string'
          ) {
            throw new BadGatewayException('GitLab returned a project without an ID or name.');
          }
          return {
            externalRepoId: String(item.id),
            fullName,
            defaultBranch: typeof item.default_branch === 'string' ? item.default_branch : 'main',
          };
        }),
      };
    }

    const jobs: Array<{ name?: string; fullName?: string; _class?: string; jobs?: unknown[] }> = [];
    const collectJobs = (items: unknown[]) => {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const job = item as { name?: string; fullName?: string; _class?: string; jobs?: unknown[] };
        if (Array.isArray(job.jobs) && job.jobs.length > 0) collectJobs(job.jobs);
        else if (!job._class?.toLowerCase().includes('folder') && (job.fullName || job.name)) jobs.push(job);
      }
    };
    if (!response || typeof response !== 'object' || !Array.isArray((response as { jobs?: unknown[] }).jobs)) {
      throw new BadGatewayException('Jenkins returned an invalid job list.');
    }
    collectJobs((response as { jobs: unknown[] }).jobs);
    return {
      data: jobs.slice(0, 100).map((job) => ({
        externalRepoId: job.fullName ?? job.name!,
        fullName: job.fullName ?? job.name!,
        defaultBranch: 'main',
      })),
    };
  }

  async create(projectId: string, organizationId: string, dto: CreateRepositoryDto) {
    await this.assertProjectInOrg(projectId, organizationId);
    const provider = dto.provider ?? RepositoryProvider.GITHUB;
    let integrationUrl: string | undefined;
    let integrationToken: string | undefined;
    let externalRepoId = dto.externalRepoId;

    if (provider === RepositoryProvider.GITHUB) {
      if (!/^\d+$/.test(dto.externalRepoId) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(dto.fullName)) {
        throw new BadRequestException('GitHub repositories require an owner/repo name and numeric repository ID.');
      }
      if (dto.integrationUrl || dto.accessToken || dto.username) {
        throw new BadRequestException('GitHub repository linking does not accept API credentials.');
      }
    } else {
      if (!dto.integrationUrl || !dto.accessToken) {
        throw new BadRequestException('Provider URL and access token are required.');
      }
      integrationUrl = await this.validateIntegrationUrl(dto.integrationUrl);
      externalRepoId = `${integrationUrl}|${dto.externalRepoId}`;
      const candidates = await this.discover(projectId, organizationId, {
        provider,
        integrationUrl,
        accessToken: dto.accessToken,
        username: dto.username,
      });
      const selected = candidates.data.find((candidate) => candidate.externalRepoId === dto.externalRepoId);
      if (!selected || selected.fullName !== dto.fullName) {
        throw new BadRequestException('The selected repository was not returned by the configured provider.');
      }
      integrationToken = this.secrets.encrypt(
        provider === RepositoryProvider.JENKINS
          ? JSON.stringify({ username: dto.username, apiToken: dto.accessToken })
          : dto.accessToken,
      );
    }
    const webhookSecret = randomBytes(32).toString('hex');

    const repo = await this.prisma.repository.create({
      data: {
        projectId,
        fullName: dto.fullName,
        provider,
        externalRepoId,
        defaultBranch: dto.defaultBranch || 'main',
        webhookSecret: this.secrets.encrypt(webhookSecret),
        ...(integrationUrl && { integrationUrl }),
        ...(integrationToken && { integrationToken }),
      },
      select: PUBLIC_REPOSITORY_SELECT,
    });

    // The webhook secret is returned once for provider-side webhook configuration.
    return { data: { ...repo, webhookSecret } };
  }

  async sync(id: string, projectId: string, organizationId: string) {
    const repository = await this.prisma.repository.findFirst({
      where: { id, projectId, project: { organizationId } },
    });
    if (!repository) throw new NotFoundException('Repository not found.');
    if (
      !repository.integrationUrl ||
      !repository.integrationToken ||
      (repository.provider !== RepositoryProvider.GITLAB && repository.provider !== RepositoryProvider.JENKINS)
    ) {
      throw new BadRequestException(
        'API synchronization is available only for configured GitLab and Jenkins integrations.',
      );
    }

    const baseUrl = await this.validateIntegrationUrl(repository.integrationUrl);
    const credential = this.secrets.decrypt(repository.integrationToken);
    const { headers, username } = this.getStoredAuth(repository.provider, credential);
    const workflows =
      repository.provider === RepositoryProvider.GITLAB
        ? await this.getGitLabPipelines(baseUrl, repository.externalRepoId, headers)
        : await this.getJenkinsBuilds(baseUrl, repository.fullName, headers);

    let synced = 0;
    let ignored = 0;
    for (const workflow of workflows) {
      const normalized = this.toWorkflowRun(repository.provider, workflow, repository, username);
      if (!normalized) {
        ignored += 1;
        continue;
      }
      await this.processor.processSyncedWorkflowRun(normalized, repository);
      synced += 1;
    }
    return { data: { fetched: workflows.length, synced, ignored } };
  }

  async remove(id: string, projectId: string, organizationId: string) {
    await this.findOne(id, projectId, organizationId);
    await this.prisma.repository.delete({ where: { id } });
    return { data: { id } };
  }

  private async validateIntegrationUrl(raw: string): Promise<string> {
    let url: URL;
    try {
      url = assertAllowedUrl(raw);
    } catch {
      throw new BadRequestException('Integration URL must resolve to a public HTTPS host.');
    }
    if (url.protocol !== 'https:' || url.search || url.hash || url.pathname.includes('..')) {
      throw new BadRequestException('Integration URL must be an HTTPS base URL without query or fragment.');
    }
    try {
      await assertResolvesToPublicAddress(url.toString());
    } catch {
      throw new BadRequestException('Integration host must resolve only to public IP addresses.');
    }
    return url.toString().replace(/\/+$/, '');
  }

  private getAuthHeaders(provider: RepositoryProvider, token: string, username?: string): Record<string, string> {
    if (/[\u0000-\u001f\u007f]/.test(token)) {
      throw new BadRequestException('Provider token contains invalid header characters.');
    }
    if (provider === RepositoryProvider.GITLAB) return { 'PRIVATE-TOKEN': token };
    if (!username) throw new BadRequestException('Jenkins username is required.');
    if (/[:\u0000-\u001f\u007f]/.test(username)) {
      throw new BadRequestException('Jenkins credentials contain invalid header characters.');
    }
    return { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}` };
  }

  private getStoredAuth(provider: RepositoryProvider, credential: string) {
    if (provider === RepositoryProvider.GITLAB) {
      return { headers: { 'PRIVATE-TOKEN': credential }, username: undefined };
    }
    let parsed: { username?: string; apiToken?: string };
    try {
      parsed = JSON.parse(credential) as { username?: string; apiToken?: string };
    } catch {
      throw new BadRequestException('Stored Jenkins credentials are invalid; reconnect this integration.');
    }
    if (!parsed.username || !parsed.apiToken) {
      throw new BadRequestException('Stored Jenkins credentials are invalid; reconnect this integration.');
    }
    return {
      headers: this.getAuthHeaders(provider, parsed.apiToken, parsed.username),
      username: parsed.username,
    };
  }

  private async getGitLabPipelines(baseUrl: string, projectId: string, headers: Record<string, string>) {
    const externalProjectId = projectId.includes('|') ? projectId.slice(projectId.indexOf('|') + 1) : projectId;
    const encodedProjectId = encodeURIComponent(externalProjectId);
    const response = await this.getJson(
      `${baseUrl}/api/v4/projects/${encodedProjectId}/pipelines?per_page=100`,
      headers,
    );
    if (!Array.isArray(response)) throw new BadGatewayException('GitLab returned an invalid pipeline list.');
    return response;
  }

  private async getJenkinsBuilds(baseUrl: string, jobFullName: string, headers: Record<string, string>) {
    const jobPath = jobFullName
      .split('/')
      .map((segment) => `job/${encodeURIComponent(segment)}`)
      .join('/');
    const response = await this.getJson(
      `${baseUrl}/${jobPath}/api/json?tree=builds[number,url,result,timestamp,duration,building,actions[lastBuiltRevision[SHA1,branch[name]],causes[userName]]]{0,100}`,
      headers,
    );
    if (!response || typeof response !== 'object' || !Array.isArray((response as { builds?: unknown[] }).builds)) {
      throw new BadGatewayException('Jenkins returned an invalid build list.');
    }
    return (response as { builds: unknown[] }).builds;
  }

  private toWorkflowRun(
    provider: RepositoryProvider,
    raw: unknown,
    repository: { fullName: string; integrationUrl: string | null },
    username?: string,
  ): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    if (provider === RepositoryProvider.GITLAB) {
      const id = record.id;
      const runNumber = Number(record.iid ?? id);
      const sha = record.sha;
      if (typeof id === 'number' && !Number.isSafeInteger(id)) {
        throw new BadGatewayException('GitLab returned a pipeline ID beyond safe integer precision.');
      }
      if (id === undefined || !Number.isSafeInteger(runNumber) || runNumber <= 0 || typeof sha !== 'string')
        return null;
      const state = String(record.status ?? '').toLowerCase();
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
      return {
        id: String(id),
        run_number: runNumber,
        name: 'Pipeline',
        status,
        conclusion: status === 'completed' ? (conclusion[state] ?? 'failure') : null,
        head_branch: record.ref ?? 'unknown',
        head_sha: sha,
        html_url: this.safeProviderUrl(
          record.web_url,
          `${repository.integrationUrl ?? 'https://gitlab.com'}/${repository.fullName}/-/pipelines/${id}`,
        ),
        head_commit: { message: null },
        triggering_actor: { login: null },
        run_started_at: record.created_at ?? null,
        updated_at: record.finished_at ?? record.updated_at ?? null,
        event: 'pipeline',
      };
    }

    const id = record.number;
    const runNumber = Number(id);
    const url = record.url;
    const actions = Array.isArray(record.actions) ? record.actions : [];
    const revisions = actions
      .filter((action): action is Record<string, unknown> => !!action && typeof action === 'object')
      .map((action) => action.lastBuiltRevision)
      .filter((revision): revision is Record<string, unknown> => !!revision && typeof revision === 'object');
    const revision = revisions[0];
    const sha = revision?.SHA1;
    if (!Number.isSafeInteger(runNumber) || runNumber <= 0 || typeof sha !== 'string') return null;
    const building = record.building === true;
    const result = String(record.result ?? '').toUpperCase();
    const jobPath = repository.fullName.split('/').map((segment) => `job/${encodeURIComponent(segment)}`).join('/');
    return {
      id: String(id),
      run_number: runNumber,
      name: repository.fullName,
      status: building ? 'in_progress' : 'completed',
      conclusion: building ? null : result === 'SUCCESS' ? 'success' : result === 'ABORTED' ? 'cancelled' : 'failure',
      head_branch:
        revision?.branch && typeof revision.branch === 'object' && 'name' in revision.branch
          ? String((revision.branch as { name: unknown }).name)
          : 'unknown',
      head_sha: sha,
      html_url: this.safeProviderUrl(url, `${repository.integrationUrl}/${jobPath}/${runNumber}/`),
      head_commit: { message: null },
      triggering_actor: { login: username ?? null },
      run_started_at: typeof record.timestamp === 'number' ? new Date(record.timestamp).toISOString() : null,
      updated_at:
        !building && typeof record.timestamp === 'number'
          ? new Date(record.timestamp + (typeof record.duration === 'number' ? record.duration : 0)).toISOString()
          : null,
      event: 'jenkins',
    };
  }

  private safeProviderUrl(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : fallback;
    } catch {
      return fallback;
    }
  }

  private async getJson(url: string, headers: Record<string, string>): Promise<unknown> {
    let response: Awaited<ReturnType<typeof safeHttpGetJson>>;
    try {
      response = await safeHttpGetJson(url, { timeoutMs: 10_000, headers, maxBytes: 1_000_000 });
    } catch {
      throw new BadGatewayException('Could not securely reach the configured CI provider.');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new BadGatewayException(`CI provider returned HTTP ${response.status}. Check the URL and credentials.`);
    }
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      throw new BadGatewayException('CI provider returned invalid JSON.');
    }
  }
}
