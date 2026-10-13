'use client';

import Link from 'next/link';
import { ProjectSelect } from '@/components/project-select';
import {
  CursorPager,
  EmptyState,
  ErrorState,
  ExternalLink,
  LoadingState,
  PageHeader,
  RunStatusBadge,
  TimeAgo,
} from '@/components/ui';
import { qs } from '@/lib/api';
import { formatDuration, shortSha } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { WorkflowRun } from '@/types/api';

const FILTER_KEYS = ['projectId', 'status', 'conclusion', 'branch'] as const;

export default function WorkflowRunsPage() {
  const { filters, cursor, cursorStack, setFilter, setCursorStack } = useUrlFilters(FILTER_KEYS);
  const { data, pagination, error, loading, reload } = useApi<WorkflowRun[]>(
    `/workflow-runs${qs({ ...filters, cursor, limit: 20 })}`,
  );
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title="Workflow runs" description="GitHub Actions runs received via webhook." />

      <div className="toolbar" role="search">
        <ProjectSelect value={filters.projectId} onChange={(v) => setFilter('projectId', v)} />
        <label className="field-inline">
          <span className="muted small">Status</span>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Any</option>
            <option value="QUEUED">Queued</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label className="field-inline">
          <span className="muted small">Conclusion</span>
          <select value={filters.conclusion} onChange={(e) => setFilter('conclusion', e.target.value)}>
            <option value="">Any</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="TIMED_OUT">Timed out</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </label>
        <label className="field-inline">
          <span className="muted small">Branch</span>
          <input
            placeholder="main"
            defaultValue={filters.branch}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('branch', e.currentTarget.value.trim())}
            onBlur={(e) => setFilter('branch', e.currentTarget.value.trim())}
          />
        </label>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState
          title={hasFilters ? 'No runs match these filters' : 'No workflow runs yet'}
          description={hasFilters ? undefined : 'Runs appear once GitHub sends workflow_run webhooks.'}
        />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Workflow</th>
                <th scope="col">Project / Event</th>
                <th scope="col">Branch / Commit</th>
                <th scope="col">Duration</th>
                <th scope="col">Started</th>
                <th scope="col">
                  <span className="sr-only">Source</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <RunStatusBadge status={r.status} conclusion={r.conclusion} />
                  </td>
                  <td>
                    <Link href={`/workflow-runs/${r.id}`} className="link strong">
                      {r.workflowName} #{r.runNumber}
                    </Link>
                    {r.commitMessage && <div className="muted small truncate">{r.commitMessage}</div>}
                  </td>
                  <td className="small">
                    {r.repository?.project.name}
                    <div className="muted">{r.eventType ?? '—'}</div>
                  </td>
                  <td className="mono small">
                    {r.branch ?? '—'}
                    <div className="muted">{shortSha(r.commitSha)}</div>
                  </td>
                  <td>{formatDuration(r.durationSeconds)}</td>
                  <td className="muted small">
                    <TimeAgo iso={r.startedAt ?? r.createdAt} />
                  </td>
                  <td className="small">
                    <ExternalLink href={r.htmlUrl}>GitHub</ExternalLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (
        <CursorPager
          hasMore={pagination.hasMore}
          nextCursor={pagination.cursor}
          cursorStack={cursorStack}
          onNavigate={setCursorStack}
        />
      )}
    </>
  );
}
