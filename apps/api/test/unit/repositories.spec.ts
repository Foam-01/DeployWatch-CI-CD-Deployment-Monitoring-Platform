import { Repository, RepositoryProvider } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { SecretBox } from '../../src/common/crypto/secret-box';
import * as ssrfGuard from '../../src/health-checks/ssrf-guard';
import { RepositoriesService } from '../../src/repositories/repositories.service';
import { WebhookEventProcessorService } from '../../src/webhooks/webhook-event-processor.service';

describe('RepositoriesService provider integrations', () => {
  const secrets = new SecretBox('a'.repeat(64));
  const prisma = {
    project: { findFirst: jest.fn().mockResolvedValue({ id: 'project-id' }) },
    repository: { create: jest.fn(), findFirst: jest.fn() },
  } as unknown as PrismaService;
  const processor = {
    processSyncedWorkflowRun: jest.fn().mockResolvedValue(undefined),
  } as unknown as WebhookEventProcessorService;
  let service: RepositoriesService;
  let resolveHost: jest.SpyInstance;
  let safeGet: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RepositoriesService(prisma, secrets, processor);
    resolveHost = jest.spyOn(ssrfGuard, 'assertResolvesToPublicAddress').mockResolvedValue(undefined);
    safeGet = jest.spyOn(ssrfGuard, 'safeHttpGetJson');
  });

  afterEach(() => {
    resolveHost.mockRestore();
    safeGet.mockRestore();
  });

  it('discovers GitLab projects using the token header and returns only repository metadata', async () => {
    safeGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify([{ id: 42, path_with_namespace: 'group/service', default_branch: 'trunk' }]),
    });

    await expect(
      service.discover('project-id', 'org-id', {
        provider: RepositoryProvider.GITLAB,
        integrationUrl: 'https://gitlab.com',
        accessToken: 'glpat-example',
      }),
    ).resolves.toEqual({
      data: [{ externalRepoId: '42', fullName: 'group/service', defaultBranch: 'trunk' }],
    });
    expect(safeGet).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/projects?membership=true&simple=true&per_page=100',
      expect.objectContaining({ headers: { 'PRIVATE-TOKEN': 'glpat-example' }, maxBytes: 1_000_000 }),
    );
    expect(resolveHost).toHaveBeenCalledWith('https://gitlab.com/');
  });

  it('discovers nested Jenkins jobs but does not offer folders as jobs', async () => {
    safeGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        jobs: [
          {
            name: 'folder',
            fullName: 'folder',
            _class: 'com.cloudbees.hudson.plugins.folder.Folder',
            jobs: [{ name: 'api', fullName: 'folder/api', _class: 'org.jenkinsci.plugins.workflow.job.WorkflowJob' }],
          },
        ],
      }),
    });

    await expect(
      service.discover('project-id', 'org-id', {
        provider: RepositoryProvider.JENKINS,
        integrationUrl: 'https://jenkins.example.com',
        accessToken: 'api-token',
        username: 'deploywatch',
      }),
    ).resolves.toEqual({
      data: [{ externalRepoId: 'folder/api', fullName: 'folder/api', defaultBranch: 'main' }],
    });
    expect(safeGet).toHaveBeenCalledWith(
      expect.stringContaining('https://jenkins.example.com/api/json?tree='),
      expect.objectContaining({
        headers: { Authorization: `Basic ${Buffer.from('deploywatch:api-token').toString('base64')}` },
      }),
    );
  });

  it('encrypts credentials before persistence and never returns the access token', async () => {
    safeGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify([{ id: 42, path_with_namespace: 'group/service' }]),
    });
    prisma.repository.create = jest.fn().mockImplementation(async ({ data, select }) => ({
      id: 'repository-id',
      projectId: 'project-id',
      provider: data.provider,
      externalRepoId: data.externalRepoId,
      fullName: data.fullName,
      defaultBranch: data.defaultBranch,
      integrationUrl: data.integrationUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...('webhookSecret' in select ? { webhookSecret: data.webhookSecret } : {}),
    }));

    const result = await service.create('project-id', 'org-id', {
      provider: RepositoryProvider.GITLAB,
      fullName: 'group/service',
      externalRepoId: '42',
      integrationUrl: 'https://gitlab.com',
      accessToken: 'glpat-sensitive',
    });
    const stored = (prisma.repository.create as jest.Mock).mock.calls[0][0].data;
    expect(stored.integrationToken).not.toContain('glpat-sensitive');
    expect(secrets.decrypt(stored.integrationToken)).toBe('glpat-sensitive');
    expect(JSON.stringify(result)).not.toContain('glpat-sensitive');
    expect(result.data.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.externalRepoId).toBe('https://gitlab.com|42');
  });

  it('rejects private provider endpoints before making any outbound request', async () => {
    await expect(
      service.discover('project-id', 'org-id', {
        provider: RepositoryProvider.GITLAB,
        integrationUrl: 'https://127.0.0.1',
        accessToken: 'glpat-example',
      }),
    ).rejects.toThrow(/public HTTPS host/);
    expect(safeGet).not.toHaveBeenCalled();
  });

  it('syncs recent Jenkins builds through the shared workflow processor', async () => {
    const repository = {
      id: 'repository-id',
      projectId: 'project-id',
      provider: RepositoryProvider.JENKINS,
      fullName: 'folder/api',
      externalRepoId: 'jenkins.example.com|folder/api',
      integrationUrl: 'https://jenkins.example.com',
      integrationToken: secrets.encrypt(JSON.stringify({ username: 'deploywatch', apiToken: 'secret-token' })),
    } as Repository;
    prisma.repository.findFirst = jest.fn().mockResolvedValue(repository);
    safeGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        builds: [
          {
            number: 17,
            url: 'https://jenkins.example.com/job/folder/job/api/17/',
            result: 'SUCCESS',
            timestamp: 1_791_965_600_000,
            duration: 30_000,
            building: false,
            actions: [{ lastBuiltRevision: { SHA1: 'a'.repeat(40), branch: { name: 'main' } } }],
          },
        ],
      }),
    });

    await expect(service.sync('repository-id', 'project-id', 'org-id')).resolves.toEqual({
      data: { fetched: 1, synced: 1, ignored: 0 },
    });
    expect(processor.processSyncedWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '17',
        run_number: 17,
        head_sha: 'a'.repeat(40),
        head_branch: 'main',
        status: 'completed',
        conclusion: 'success',
      }),
      repository,
    );
    expect(safeGet).toHaveBeenCalledWith(
      expect.stringContaining('/job/folder/job/api/api/json?tree='),
      expect.objectContaining({
        headers: { Authorization: `Basic ${Buffer.from('deploywatch:secret-token').toString('base64')}` },
      }),
    );
  });
});
