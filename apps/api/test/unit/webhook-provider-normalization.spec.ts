import { Repository, RepositoryProvider } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { NotifierService } from '../../src/notifications/notifier.service';
import { WebhookEventProcessorService } from '../../src/webhooks/webhook-event-processor.service';

describe('provider webhook normalization', () => {
  const repository = {
    id: 'repository-id',
    projectId: 'project-id',
    provider: RepositoryProvider.GITLAB,
    fullName: 'group/service',
    integrationUrl: 'https://gitlab.example.com',
  } as Repository;

  function processor(overrides: Record<string, unknown> = {}) {
    const prisma = {
      workflowRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      environment: { findFirst: jest.fn().mockResolvedValue({ id: 'environment-id' }) },
      deployment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    } as unknown as PrismaService;
    const notifier = { emit: jest.fn().mockResolvedValue(undefined) } as unknown as NotifierService;
    return { service: new WebhookEventProcessorService(prisma, notifier), prisma };
  }

  it('normalizes GitLab pipeline hooks and preserves 64-bit provider IDs exactly', async () => {
    const { service, prisma } = processor();
    const gitlabRepository = {
      ...repository,
      provider: RepositoryProvider.GITLAB,
    } as Repository;

    await service.process(
      'Pipeline Hook',
      {
        object_kind: 'pipeline',
        object_attributes: {
          id: '9007199254740993',
          iid: 27,
          ref: 'main',
          sha: 'a'.repeat(40),
          status: 'failed',
          created_at: '2026-10-14T08:00:00Z',
          finished_at: '2026-10-14T08:01:00Z',
        },
        project: { name: 'service', web_url: 'https://gitlab.example.com/group/service' },
      },
      gitlabRepository,
    );

    expect(prisma.workflowRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalRunId: BigInt('9007199254740993'),
        runNumber: 27,
        status: 'COMPLETED',
        conclusion: 'FAILURE',
        branch: 'main',
        htmlUrl: 'https://gitlab.example.com/group/service/-/pipelines/9007199254740993',
      }),
    });
  });

  it('fails malformed supported provider events instead of silently marking them processed', async () => {
    const { service } = processor();
    await expect(service.process('Pipeline Hook', {}, repository)).rejects.toThrow(
      'GitLab pipeline hook is missing its object attributes.',
    );
  });

  it('normalizes GitLab deployment hooks without accepting unsafe external URLs', async () => {
    const { service, prisma } = processor();
    const gitlabRepository = { ...repository, provider: RepositoryProvider.GITLAB } as Repository;

    await service.process(
      'Deployment Hook',
      {
        object_kind: 'deployment',
        status: 'success',
        deployment_id: 901,
        deployable_id: 555,
        deployable: {
          id: 555,
          sha: 'b'.repeat(40),
          created_at: '2026-10-14T08:00:00Z',
        },
        environment: { name: 'Production', external_url: 'javascript:alert(1)' },
      },
      gitlabRepository,
    );

    expect(prisma.deployment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalDeploymentId: '901',
        status: 'SUCCESS',
        environmentId: 'environment-id',
        externalUrl: null,
      }),
    });
  });

  it('normalizes signed Jenkins build payloads into the shared workflow-run model', async () => {
    const { service, prisma } = processor();
    const jenkinsRepository = {
      ...repository,
      provider: RepositoryProvider.JENKINS,
      fullName: 'folder/service',
      integrationUrl: 'https://jenkins.example.com',
    } as Repository;

    await service.process(
      'build',
      {
        build_number: 31,
        build_status: 'SUCCESS',
        build_url: 'https://jenkins.example.com/job/folder/job/service/31/',
        git_branch: 'release',
        git_commit: 'c'.repeat(40),
        timestamp: '2026-10-14T08:00:00Z',
        completed_at: '2026-10-14T08:02:00Z',
      },
      jenkinsRepository,
    );

    expect(prisma.workflowRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalRunId: BigInt(31),
        runNumber: 31,
        workflowName: 'folder/service',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        branch: 'release',
        htmlUrl: 'https://jenkins.example.com/job/folder/job/service/31/',
      }),
    });
  });

  it('normalizes signed Jenkins deployment payloads into the shared deployment model', async () => {
    const { service, prisma } = processor();
    const jenkinsRepository = {
      ...repository,
      provider: RepositoryProvider.JENKINS,
      fullName: 'folder/service',
      integrationUrl: 'https://jenkins.example.com',
    } as Repository;

    await service.process(
      'deployment',
      {
        deployment_id: 'release-17',
        deployment_status: 'SUCCESS',
        environment: 'Production',
        git_commit: 'd'.repeat(40),
        started_at: '2026-10-14T08:00:00Z',
        completed_at: '2026-10-14T08:03:00Z',
        deployment_url: 'https://prod.example.com',
        build_url: 'https://jenkins.example.com/job/folder/job/service/17/',
      },
      jenkinsRepository,
    );

    expect(prisma.deployment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalDeploymentId: 'release-17',
        status: 'SUCCESS',
        environmentId: 'environment-id',
        externalUrl: 'https://prod.example.com/',
      }),
    });
  });
});
