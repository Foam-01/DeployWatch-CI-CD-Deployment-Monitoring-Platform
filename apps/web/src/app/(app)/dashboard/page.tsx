'use client';

import Link from 'next/link';
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

  // Polling keeps the overview fresh without WebSockets (see ADR: polling before real-time).
  useEffect(() => {
    const id = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reload]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { summary, recentRuns, recentDeployments } = data;

  return (
    <>
      <PageHeader title="Overview" description="Last 30 days across all projects. Refreshes every 30 seconds." />

      <section className="stat-grid" aria-label="Summary metrics">
        <StatCard label="Active projects" value={summary.totalProjects} />
        <StatCard label="Successful runs" value={summary.successfulRuns} tone="success" />
        <StatCard label="Failed runs" value={summary.failedRuns} tone={summary.failedRuns ? 'error' : undefined} />
        <StatCard
          label="Deployment success rate"
          value={summary.deploymentSuccessRate === null ? '—' : `${summary.deploymentSuccessRate}%`}
          hint="Success ÷ (success + failure)"
        />
        <StatCard
          label="Services"
          value={`${summary.services.healthy} / ${summary.services.degraded} / ${summary.services.down}`}
          hint="Healthy / Degraded / Down"
          tone={summary.services.down ? 'error' : summary.services.degraded ? 'warning' : 'success'}
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
