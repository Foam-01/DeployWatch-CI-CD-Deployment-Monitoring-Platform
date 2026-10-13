'use client';

import Link from 'next/link';
import {
  EmptyState,
  ErrorState,
  ExternalLink,
  LoadingState,
  PageHeader,
  RunStatusBadge,
  StatusBadge,
  TimeAgo,
} from '@/components/ui';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { WorkflowRun } from '@/types/api';

export default function WorkflowRunDetailPage({ params }: { params: { id: string } }) {
  const { data: run, error, loading, reload } = useApi<WorkflowRun>(`/workflow-runs/${params.id}`);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!run) return null;

  return (
    <>
      <nav className="breadcrumb small" aria-label="Breadcrumb">
        <Link href="/workflow-runs" className="link">
          Workflow runs
        </Link>{' '}
        / #{run.runNumber}
      </nav>
      <PageHeader
        title={`${run.workflowName} #${run.runNumber}`}
        description={run.commitMessage ?? undefined}
        actions={
          <>
            <RunStatusBadge status={run.status} conclusion={run.conclusion} />
            <a href={run.htmlUrl} target="_blank" rel="noopener noreferrer" className="btn">
              Open on GitHub ↗
            </a>
          </>
        }
      />

      <section className="card">
        <dl className="details">
          <div>
            <dt>Project</dt>
            <dd>
              {run.repository?.project.id ? (
                <Link href={`/projects/${run.repository.project.id}`} className="link">
                  {run.repository.project.name}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Repository</dt>
            <dd className="mono">{run.repository?.fullName ?? '—'}</dd>
          </div>
          <div>
            <dt>Status / Conclusion</dt>
            <dd>
              {run.status} / {run.conclusion ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd className="mono">{run.branch ?? '—'}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd className="mono">{run.commitSha}</dd>
          </div>
          <div>
            <dt>Triggered by</dt>
            <dd>{run.triggeredBy ?? '—'}</dd>
          </div>
          <div>
            <dt>Event</dt>
            <dd>{run.eventType ?? '—'}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(run.durationSeconds)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(run.startedAt)}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{formatDateTime(run.completedAt)}</dd>
          </div>
          <div>
            <dt>GitHub run ID</dt>
            <dd className="mono">{run.externalRunId}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Deployments from this run</h2>
        </div>
        {!run.deployments?.length ? (
          <EmptyState title="This run did not produce a deployment" />
        ) : (
          <ul className="list">
            {run.deployments.map((d) => (
              <li key={d.id} className="list-row">
                <StatusBadge value={d.status} />
                <div className="list-main">
                  <span className="mono small">{d.commitSha.slice(0, 7)}</span>
                  {d.errorSummary && <span className="form-error small">{d.errorSummary}</span>}
                </div>
                {d.externalUrl && <ExternalLink href={d.externalUrl}>Open</ExternalLink>}
                <span className="muted small">
                  <TimeAgo iso={d.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
