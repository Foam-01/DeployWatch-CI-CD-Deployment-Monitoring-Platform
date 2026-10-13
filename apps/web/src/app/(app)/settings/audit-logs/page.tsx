'use client';

import {
  CursorPager,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  TimeAgo,
} from '@/components/ui';
import { qs } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { AuditLogEntry } from '@/types/api';

const FILTER_KEYS = ['resourceType'] as const;

const RESOURCE_TYPES = ['membership', 'incident', 'organization', 'project', 'repository'];

/** Turns metadata like { from: 'VIEWER', to: 'MEMBER' } into readable text. */
function describe(entry: AuditLogEntry): string {
  const m = entry.metadata ?? {};
  if (typeof m.from === 'string' && typeof m.to === 'string') return `${m.from} → ${m.to}`;
  if (typeof m.email === 'string') return `${m.email}${typeof m.role === 'string' ? ` as ${m.role}` : ''}`;
  if (typeof m.message === 'string') return m.message;
  return '';
}

export default function AuditLogPage() {
  const { orgId, role } = useAuth();
  const { filters, cursor, cursorStack, setFilter, setCursorStack } = useUrlFilters(FILTER_KEYS);
  const allowed = role === 'OWNER' || role === 'ADMIN';
  const logs = useApi<AuditLogEntry[]>(
    orgId && allowed ? `/organizations/${orgId}/audit-logs${qs({ ...filters, cursor, limit: 50 })}` : null,
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="Audit log" />
        <EmptyState title="Access denied" description="Only owners and admins can view the audit log." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Audit log" description="Who changed what, and when. Entries cannot be edited." />

      <div className="toolbar" role="search">
        <label className="field-inline">
          <span className="small">Resource</span>
          <select value={filters.resourceType} onChange={(e) => setFilter('resourceType', e.target.value)}>
            <option value="">All</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {logs.loading && !logs.data ? (
        <LoadingState />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={logs.reload} />
      ) : !logs.data?.length ? (
        <EmptyState
          title="No activity recorded yet"
          description="Membership changes, incident resolutions and organization edits appear here."
        />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted small">
                    <TimeAgo iso={entry.createdAt} />
                  </td>
                  <td>{entry.actorUser?.name ?? <span className="muted">System</span>}</td>
                  <td>
                    <span className={`action action-${entry.action.toLowerCase()}`}>{entry.action.toLowerCase()}</span>
                  </td>
                  <td>
                    {entry.resourceType}
                    {entry.resourceId && <div className="muted small mono">{entry.resourceId.slice(0, 8)}</div>}
                  </td>
                  <td className="small">{describe(entry) || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.pagination && (
        <CursorPager
          hasMore={logs.pagination.hasMore}
          nextCursor={logs.pagination.cursor}
          cursorStack={cursorStack}
          onNavigate={setCursorStack}
        />
      )}
    </>
  );
}
