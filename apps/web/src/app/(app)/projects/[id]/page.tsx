'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
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
  const [archiving, setArchiving] = useState(false);

  if (project.loading) return <LoadingState />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.reload} />;
  const p = project.data;
  if (!p) return null;

  async function archive() {
    if (!window.confirm(`Archive "${p!.name}"? History is kept and the project becomes read-only.`)) return;
    setArchiving(true);
    try {
      await api.post(`/projects/${p!.id}/archive`);
      project.reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Archive failed.');
    } finally {
      setArchiving(false);
    }
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
            {canWrite && p.status === 'ACTIVE' && (
              <button type="button" className="btn btn-ghost" onClick={archive} disabled={archiving}>
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            )}
          </>
        }
      />

      {m && (
        <section className="stat-grid" aria-label="Project metrics (30 days)">
          <StatCard label="Runs (30d)" value={m.workflowRuns.total} />
          <StatCard label="Successful runs" value={m.workflowRuns.successful} tone="success" />
          <StatCard label="Failed runs" value={m.workflowRuns.failed} tone={m.workflowRuns.failed ? 'error' : undefined} />
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
  const [fullName, setFullName] = useState('');
  const [externalRepoId, setExternalRepoId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Repository | null>(null);

  async function link(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<Repository>(`/projects/${projectId}/repositories`, {
        fullName: fullName.trim(),
        externalRepoId: externalRepoId.trim(),
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

  async function unlink(repo: Repository) {
    if (!window.confirm(`Unlink ${repo.fullName}? Its workflow run history will be deleted.`)) return;
    try {
      await api.delete(`/projects/${projectId}/repositories/${repo.id}`);
      onChange();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unlink failed.');
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>GitHub repositories</h2>
      </div>

      {repositories.length === 0 ? (
        <EmptyState title="No repository linked" />
      ) : (
        <ul className="list">
          {repositories.map((r) => (
            <li key={r.id} className="list-row">
              <div className="list-main">
                <strong className="mono">{r.fullName}</strong>
                <span className="muted small mono">
                  Webhook URL: {API_BASE}/webhooks/github/{r.id}
                </span>
              </div>
              {canManage && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => unlink(r)}>
                  Unlink
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {created?.webhookSecret && (
        <div className="callout" role="status">
          <strong>Repository linked. Copy the webhook secret now — it will not be shown again.</strong>
          <ol className="small">
            <li>
              GitHub → <span className="mono">{created.fullName}</span> → Settings → Webhooks → Add webhook
            </li>
            <li>
              Payload URL: <code>{API_BASE}/webhooks/github/{created.id}</code>
            </li>
            <li>
              Content type: <code>application/json</code>
            </li>
            <li>
              Secret: <code className="secret">{created.webhookSecret}</code>
            </li>
            <li>Events: Workflow runs, Deployment statuses</li>
          </ol>
          <button type="button" className="btn btn-sm" onClick={() => setCreated(null)}>
            I saved it
          </button>
        </div>
      )}

      {canManage && (
        <form className="form" onSubmit={link}>
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={submitting || !fullName || !externalRepoId}>
            {submitting ? 'Linking…' : 'Link repository'}
          </button>
        </form>
      )}
    </section>
  );
}
