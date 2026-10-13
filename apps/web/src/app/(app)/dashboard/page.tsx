'use client';

import Link from 'next/link';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
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
import { shortSha } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { DashboardOverview } from '@/types/api';

const POLL_INTERVAL_MS = 30_000;

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi<DashboardOverview>('/dashboard');

  // Polling keeps the overview fresh without WebSockets (polling before real-time).
  // Paused while the tab is hidden; refreshes immediately when the user comes back.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { summary, recentRuns, recentDeployments } = data;

  return (
    <>
      <PageHeader title="Overview" description="Last 30 days across all projects. Refreshes every 30 seconds." />

      <SystemStatus summary={summary} />

      <section className="stat-grid" aria-label="Summary metrics">
        <StatCard label="Active projects" value={summary.totalProjects} />
        <StatCard label="Successful runs" value={summary.successfulRuns} tone="success" />
        <StatCard label="Failed runs" value={summary.failedRuns} tone={summary.failedRuns ? 'error' : undefined} />
        <StatCard
          label="Deploy success"
          value={summary.deploymentSuccessRate === null ? '—' : `${summary.deploymentSuccessRate}%`}
          hint="of finished deploys"
        />
        <StatCard
          label="Services"
          tone={summary.services.down ? 'error' : summary.services.degraded ? 'warning' : 'success'}
          value={
            <span className="service-split">
              <span className="split">
                {summary.services.healthy}
                <small>healthy</small>
              </span>
              <span className={`split ${summary.services.degraded ? 'split-warning' : ''}`}>
                {summary.services.degraded}
                <small>degraded</small>
              </span>
              <span className={`split ${summary.services.down ? 'split-error' : ''}`}>
                {summary.services.down}
                <small>down</small>
              </span>
            </span>
          }
        />
        <StatCard
          label="Open incidents"
          value={summary.openIncidents}
          tone={summary.openIncidents ? 'error' : 'success'}
        />
      </section>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Recent workflow runs</h2>
            <Link href="/workflow-runs" className="link small">
              View all
            </Link>
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState
              title="No workflow runs yet"
              description="Connect a GitHub repository and push a commit to see runs here."
            />
          ) : (
            <ul className="list">
              {recentRuns.map((run) => (
                <li key={run.id}>
                  <Link href={`/workflow-runs/${run.id}`} className="list-row">
                    <RunStatusBadge status={run.status} conclusion={run.conclusion} />
                    <div className="list-main">
                      <strong>
                        {run.workflowName} #{run.runNumber}
                      </strong>
                      <span className="muted small">
                        {run.repository?.project.name} · {run.branch ?? '—'} ·{' '}
                        <span className="mono">{shortSha(run.commitSha)}</span>
                      </span>
                    </div>
                    <span className="muted small">
                      <TimeAgo iso={run.createdAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Recent deployments</h2>
            <Link href="/deployments" className="link small">
              View all
            </Link>
          </div>
          {recentDeployments.length === 0 ? (
            <EmptyState title="No deployments yet" />
          ) : (
            <ul className="list">
              {recentDeployments.map((d) => (
                <li key={d.id} className="list-row">
                  <StatusBadge value={d.status} />
                  <div className="list-main">
                    <strong>
                      {d.project?.name} → {d.environment?.name}
                    </strong>
                    <span className="muted small mono">{shortSha(d.commitSha)}</span>
                  </div>
                  <span className="muted small">
                    <TimeAgo iso={d.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** One-line answer to "is anything broken right now?", shown before any metric. */
function SystemStatus({ summary }: { summary: DashboardOverview['summary'] }) {
  const problems: React.ReactNode[] = [];
  if (summary.services.down) {
    problems.push(
      <Link key="down" href="/services">
        {summary.services.down} service{summary.services.down > 1 ? 's' : ''} down
      </Link>,
    );
  }
  if (summary.services.degraded) {
    problems.push(
      <Link key="degraded" href="/services">
        {summary.services.degraded} degraded
      </Link>,
    );
  }
  if (summary.openIncidents) {
    problems.push(
      <Link key="incidents" href="/incidents?status=OPEN">
        {summary.openIncidents} open incident{summary.openIncidents > 1 ? 's' : ''}
      </Link>,
    );
  }

  const ok = problems.length === 0;
  return (
    <section className={`system-status ${ok ? 'is-ok' : 'is-bad'}`} role="status" aria-label="System status">
      {ok ? <CircleCheck size={18} aria-hidden /> : <TriangleAlert size={18} aria-hidden />}
      <span>
        {ok
          ? 'All monitored services are operational'
          : problems.flatMap((p, i) => (i === 0 ? [p] : [<span key={`sep-${i}`}> · </span>, p]))}
      </span>
      <span className="system-status-meta">
        {summary.failedRuns} failed run{summary.failedRuns === 1 ? '' : 's'} in 30 days
      </span>
    </section>
  );
}
