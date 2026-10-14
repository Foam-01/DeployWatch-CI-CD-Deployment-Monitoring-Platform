'use client';

import { ProjectSelect } from '@/components/project-select';
import { DeploymentComparison } from '@/components/deployment-comparison';
import {
  CursorPager,
  EmptyState,
  ErrorState,
  ExternalLink,
  LoadingState,
  PageHeader,
  StatusBadge,
  TimeAgo,
} from '@/components/ui';
import { qs } from '@/lib/api';
import { durationBetween, formatDuration, shortSha } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { Deployment } from '@/types/api';

const FILTER_KEYS = ['projectId', 'status'] as const;

export default function DeploymentsPage() {
  const { filters, cursor, cursorStack, setFilter, setCursorStack } = useUrlFilters(FILTER_KEYS);
  const { data, pagination, error, loading, reload } = useApi<Deployment[]>(
    `/deployments${qs({ ...filters, cursor, limit: 20 })}`,
  );
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title="Deployments" description="Deployment history across environments." />

      <div className="toolbar" role="search">
        <ProjectSelect value={filters.projectId} onChange={(v) => setFilter('projectId', v)} />
        <label className="field-inline">
          <span className="muted small">Status</span>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Any</option>
            <option value="QUEUED">Queued</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>

      <DeploymentComparison />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title={hasFilters ? 'No deployments match these filters' : 'No deployments yet'} />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Project</th>
                <th scope="col">Environment</th>
                <th scope="col">Commit</th>
                <th scope="col">Triggered by</th>
                <th scope="col">Duration</th>
                <th scope="col">Started</th>
                <th scope="col">Links</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td>
                    <StatusBadge value={d.status} />
                  </td>
                  <td className="strong">{d.project?.name}</td>
                  <td>
                    {d.environment?.name}
                    {d.environment?.isProduction && <span className="chip chip-prod chip-sm">prod</span>}
                  </td>
                  <td className="mono small">
                    {shortSha(d.commitSha)}
                    {d.errorSummary && <div className="form-error">{d.errorSummary}</div>}
                  </td>
                  <td className="small">{d.triggeredBy ?? '—'}</td>
                  <td>{formatDuration(durationBetween(d.startedAt, d.completedAt))}</td>
                  <td className="muted small">
                    <TimeAgo iso={d.startedAt ?? d.createdAt} />
                  </td>
                  <td className="small links">
                    {d.workflowRun && <ExternalLink href={d.workflowRun.htmlUrl}>Run</ExternalLink>}
                    {d.externalUrl && <ExternalLink href={d.externalUrl}>Site</ExternalLink>}
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
