'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  RunStatusBadge,
  StatCard,
  StatusBadge,
  TimeAgo,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDuration, shortSha } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { Project, ProjectMetrics, Repository, WorkflowRun } from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { canWrite, canManageIntegrations } = useAuth();
  const project = useApi<Project>(`/projects/${params.id}`);
  const metrics = useApi<ProjectMetrics>(`/projects/${params.id}/metrics`);
  const runs = useApi<WorkflowRun[]>(`/projects/${params.id}/workflow-runs?limit=10`);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (project.loading) return <LoadingState />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.reload} />;
  const p = project.data;
  if (!p) return null;

  async function archive() {
    await api.post(`/projects/${p!.id}/archive`);
    project.reload();
  }

  const m = metrics.data;

  return (
    <>
      <PageHeader
        title={p.name}
        description={p.description ?? undefined}
        actions={
          <>
            <StatusBadge value={p.status} />
            <Link href={`/projects/${p.id}/settings`} className="btn">
              Settings
            </Link>
            {canWrite && p.status === 'ACTIVE' && (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmArchive(true)}>
                Archive
              </button>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${p.name}?`}
        description="Run, deployment and incident history is kept. The project becomes read-only and stops appearing in active lists."
        confirmLabel="Archive project"
        onConfirm={archive}
        onClose={() => setConfirmArchive(false)}
      />

      {m && (
        <section className="stat-grid" aria-label="Project metrics (30 days)">
          <StatCard label="Runs (30d)" value={m.workflowRuns.total} />
          <StatCard label="Successful runs" value={m.workflowRuns.successful} tone="success" />
          <StatCard
            label="Failed runs"
            value={m.workflowRuns.failed}
            tone={m.workflowRuns.failed ? 'error' : undefined}
          />
          <StatCard
            label="Deploy success rate"
            value={m.deployments.successRate === null ? '—' : `${m.deployments.successRate}%`}
          />
          <StatCard label="Open incidents" value={m.openIncidents} tone={m.openIncidents ? 'error' : 'success'} />
        </section>
      )}

      <div className="two-col">
        <RepositoriesCard
          projectId={p.id}
          repositories={p.repositories}
          canManage={canManageIntegrations && p.status === 'ACTIVE'}
          onChange={project.reload}
        />

        <section className="card">
          <div className="card-head">
            <h2>Environments & services</h2>
          </div>
          {p.environments.length === 0 ? (
            <EmptyState title="No environments" />
          ) : (
            <div className="chips">
              {p.environments.map((env) => (
                <span key={env.id} className={`chip ${env.isProduction ? 'chip-prod' : ''}`}>
                  {env.name}
                  {env.isProduction && ' · production'}
                </span>
              ))}
            </div>
          )}
          {p.services && p.services.length > 0 && (
            <ul className="list">
              {p.services.map((s) => (
                <li key={s.id}>
                  <Link href={`/services/${s.id}`} className="list-row">
                    <StatusBadge value={s.currentStatus} />
                    <div className="list-main">
                      <strong>{s.name}</strong>
                      <span className="muted small mono">{s.healthUrl}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent workflow runs</h2>
          <Link href={`/workflow-runs?projectId=${p.id}`} className="link small">
            View all
          </Link>
        </div>
        {runs.loading ? (
          <LoadingState />
        ) : runs.error ? (
          <ErrorState error={runs.error} onRetry={runs.reload} />
        ) : !runs.data?.length ? (
          <EmptyState title="No workflow runs yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Workflow</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Commit</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <RunStatusBadge status={r.status} conclusion={r.conclusion} />
                    </td>
                    <td>
                      <Link href={`/workflow-runs/${r.id}`} className="link">
                        {r.workflowName} #{r.runNumber}
                      </Link>
                    </td>
                    <td className="mono small">{r.branch ?? '—'}</td>
                    <td className="mono small">{shortSha(r.commitSha)}</td>
                    <td>{formatDuration(r.durationSeconds)}</td>
                    <td className="muted small">
                      <TimeAgo iso={r.startedAt ?? r.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RepositoriesCard({
  projectId,
  repositories,
  canManage,
  onChange,
}: {
  projectId: string;
  repositories: Repository[];
  canManage: boolean;
  onChange: () => void;
}) {
  type ProviderCandidate = { externalRepoId: string; fullName: string; defaultBranch: string };
  const [fullName, setFullName] = useState('');
  const [externalRepoId, setExternalRepoId] = useState('');
  const [provider, setProvider] = useState<Repository['provider']>('GITHUB');
  const [integrationUrl, setIntegrationUrl] = useState('https://gitlab.com');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');
  const [candidates, setCandidates] = useState<ProviderCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [created, setCreated] = useState<Repository | null>(null);
  const [unlinking, setUnlinking] = useState<Repository | null>(null);

  async function linkGitHub(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<Repository>(`/projects/${projectId}/repositories`, {
        fullName: fullName.trim(),
        externalRepoId: externalRepoId.trim(),
        provider,
      });
      setCreated(res.data);
      setFullName('');
      setExternalRepoId('');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not link repository.');
    } finally {
      setSubmitting(false);
    }
  }

  async function discover(e: FormEvent) {
    e.preventDefault();
    if (discovering) return;
    setDiscovering(true);
    setError(null);
    setCandidates([]);
    try {
      const res = await api.post<ProviderCandidate[]>(`/projects/${projectId}/repositories/discover`, {
        provider,
        integrationUrl: integrationUrl.trim(),
        accessToken,
        ...(provider === 'JENKINS' && { username: username.trim() }),
      });
      setCandidates(res.data);
      if (res.data.length === 0) setError('No repositories or jobs were found for this account.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not discover provider repositories.');
    } finally {
      setDiscovering(false);
    }
  }

  async function linkCandidate(candidate: ProviderCandidate) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<Repository>(`/projects/${projectId}/repositories`, {
        provider,
        fullName: candidate.fullName,
        externalRepoId: candidate.externalRepoId,
        defaultBranch: candidate.defaultBranch,
        integrationUrl: integrationUrl.trim(),
        accessToken,
        ...(provider === 'JENKINS' && { username: username.trim() }),
      });
      setCreated(res.data);
      setAccessToken('');
      setUsername('');
      setCandidates((items) => items.filter((item) => item.externalRepoId !== candidate.externalRepoId));
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not link provider repository.');
    } finally {
      setSubmitting(false);
    }
  }

  async function unlink(repo: Repository) {
    await api.delete(`/projects/${projectId}/repositories/${repo.id}`);
    onChange();
  }

  async function sync(repo: Repository) {
    if (syncingId) return;
    setSyncingId(repo.id);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await api.post<{ fetched: number; synced: number; ignored: number }>(
        `/projects/${projectId}/repositories/${repo.id}/sync`,
      );
      setSyncMessage(`${repo.fullName}: synced ${result.data.synced} of ${result.data.fetched} recent runs.`);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sync provider data.');
    } finally {
      setSyncingId(null);
    }
  }

  const webhookPath = (repo: Repository) => `${API_BASE}/webhooks/${repo.provider.toLowerCase()}/${repo.id}`;

  return (
    <section className="card">
      <div className="card-head">
        <h2>CI/CD integrations</h2>
      </div>

      {repositories.length === 0 ? (
        <EmptyState
          title="No repository linked"
          description="Connect GitHub, GitLab, or Jenkins to track workflow runs."
        />
      ) : (
        <ul className="list">
          {repositories.map((r) => (
            <li key={r.id} className="list-row">
              <div className="list-main">
                <span className="eyebrow">{r.provider}</span>
                <strong className="mono">{r.fullName}</strong>
                <span className="muted small mono">Webhook URL: {webhookPath(r)}</span>
              </div>
              {canManage && (
                <div className="actions">
                  {r.provider !== 'GITHUB' && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={syncingId !== null}
                      onClick={() => sync(r)}
                    >
                      {syncingId === r.id ? 'Syncing…' : 'Sync recent runs'}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUnlinking(r)}>
                    Unlink
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {syncMessage && (
        <p className="callout" role="status">
          {syncMessage}
        </p>
      )}

      <ConfirmDialog
        open={unlinking !== null}
        danger
        title={`Unlink ${unlinking?.fullName ?? 'repository'}?`}
        description="Its workflow run history will be permanently deleted and new webhook deliveries will be rejected."
        confirmLabel="Unlink repository"
        onConfirm={() => unlink(unlinking!)}
        onClose={() => setUnlinking(null)}
      />

      {created?.webhookSecret && (
        <div className="callout" role="status">
          <strong>{created.provider} linked. Copy this webhook secret now — it will not be shown again.</strong>
          <ol className="small">
            <li>
              Configure a webhook for <span className="mono">{created.fullName}</span> in the provider.
            </li>
            <li>
              Payload URL: <code>{webhookPath(created)}</code>
            </li>
            <li>
              Content type: <code>application/json</code>
            </li>
            <li>
              {created.provider === 'GITLAB'
                ? 'Secret token'
                : created.provider === 'JENKINS'
                  ? 'HMAC-SHA256 signing secret'
                  : 'Secret'}
              : <code className="secret">{created.webhookSecret}</code>
            </li>
            <li>
              Events:{' '}
              {created.provider === 'GITHUB'
                ? 'Workflow runs and deployment statuses'
                : created.provider === 'GITLAB'
                  ? 'Pipeline and deployment events'
                  : 'Signed Generic Webhook Trigger build and deployment events'}
            </li>
            {created.provider === 'JENKINS' && (
              <li>
                Send <code>X-DeployWatch-Signature: sha256=&lt;HMAC-SHA256 of raw request body&gt;</code> and{' '}
                <code>X-DeployWatch-Event: build</code> or <code>deployment</code>.
              </li>
            )}
          </ol>
          <button type="button" className="btn btn-sm" onClick={() => setCreated(null)}>
            I saved it
          </button>
        </div>
      )}

      {canManage && (
        <div className="form">
          <label className="field">
            <span>Provider</span>
            <select
              value={provider}
              disabled={submitting || discovering}
              onChange={(e) => {
                const selected = e.target.value;
                if (selected !== 'GITHUB' && selected !== 'GITLAB' && selected !== 'JENKINS') return;
                setProvider(selected);
                setCandidates([]);
                setIntegrationUrl(selected === 'GITLAB' ? 'https://gitlab.com' : '');
                setAccessToken('');
                setUsername('');
                setError(null);
              }}
            >
              <option value="GITHUB">GitHub</option>
              <option value="GITLAB">GitLab</option>
              <option value="JENKINS">Jenkins</option>
            </select>
          </label>
          {provider === 'GITHUB' ? (
            <form className="form" onSubmit={linkGitHub}>
              <div className="form-row">
                <label className="field">
                  <span>Repository (owner/name)</span>
                  <input
                    placeholder="Foam-01/DeployWatch"
                    pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>GitHub repository ID</span>
                  <input
                    inputMode="numeric"
                    pattern="\d+"
                    required
                    value={externalRepoId}
                    onChange={(e) => setExternalRepoId(e.target.value)}
                  />
                </label>
              </div>
              <small className="muted">
                Find the numeric ID at <span className="mono">api.github.com/repos/owner/name</span> (field{' '}
                <span className="mono">id</span>).
              </small>
              <button type="submit" className="btn btn-primary" disabled={submitting || !fullName || !externalRepoId}>
                {submitting ? 'Linking…' : 'Link repository'}
              </button>
            </form>
          ) : (
            <form className="form" onSubmit={discover}>
              <label className="field">
                <span>HTTPS provider base URL</span>
                <input
                  type="url"
                  required
                  placeholder="https://gitlab.example.com"
                  value={integrationUrl}
                  onChange={(e) => setIntegrationUrl(e.target.value)}
                />
              </label>
              {provider === 'JENKINS' && (
                <label className="field">
                  <span>Jenkins username</span>
                  <input
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
              )}
              <label className="field">
                <span>{provider === 'GITLAB' ? 'GitLab access token' : 'Jenkins API token'}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </label>
              <small className="muted">
                Credentials are encrypted at rest and not shown again. Only HTTPS hosts resolving to public IP addresses
                are allowed.
              </small>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={discovering || !integrationUrl || !accessToken || (provider === 'JENKINS' && !username)}
              >
                {discovering ? 'Discovering…' : 'Discover repositories/jobs'}
              </button>
              {candidates.length > 0 && (
                <ul className="list">
                  {candidates.map((candidate) => (
                    <li className="list-row" key={candidate.externalRepoId}>
                      <strong className="mono">{candidate.fullName}</strong>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={submitting}
                        onClick={() => linkCandidate(candidate)}
                      >
                        {submitting ? 'Linking…' : 'Link'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
