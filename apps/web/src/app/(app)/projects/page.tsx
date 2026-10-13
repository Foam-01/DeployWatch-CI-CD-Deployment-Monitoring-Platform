'use client';

import Link from 'next/link';
import { CursorPager, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, TimeAgo } from '@/components/ui';
import { qs } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { Project } from '@/types/api';

const FILTER_KEYS = ['status', 'q'] as const;

export default function ProjectsPage() {
  const { canWrite } = useAuth();
  const { filters, cursor, cursorStack, setFilter, setCursorStack } = useUrlFilters(FILTER_KEYS);
  const { data, pagination, error, loading, reload } = useApi<Project[]>(
    `/projects${qs({ status: filters.status, cursor, limit: 20 })}`,
  );

  // Name search is applied to the current page client-side; the API filters by status.
  const term = filters.q.trim().toLowerCase();
  const projects = (data ?? []).filter(
    (p) => !term || p.name.toLowerCase().includes(term) || p.slug.includes(term),
  );

  return (
    <>
      <PageHeader
        title="Projects"
        description="Repositories and environments you monitor."
        actions={
          canWrite && (
            <Link href="/projects/new" className="btn btn-primary">
              New project
            </Link>
          )
        }
      />

      <div className="toolbar" role="search">
        <label className="field-inline">
          <span className="sr-only">Search projects</span>
          <input
            type="search"
            placeholder="Search by name…"
            defaultValue={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
        </label>
        <label className="field-inline">
          <span className="muted small">Status</span>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : projects.length === 0 ? (
        <EmptyState
          title={term || filters.status ? 'No projects match your filters' : 'No projects yet'}
          description={canWrite && !term ? 'Create a project, then link a GitHub repository.' : undefined}
          action={
            canWrite && !term && !filters.status ? (
              <Link href="/projects/new" className="btn btn-primary">
                Create project
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col">Repositories</th>
                <th scope="col">Environments</th>
                <th scope="col">Deployments</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/projects/${p.id}`} className="link strong">
                      {p.name}
                    </Link>
                    <div className="muted small mono">{p.slug}</div>
                  </td>
                  <td>
                    <StatusBadge value={p.status} />
                  </td>
                  <td className="small">{p.repositories.map((r) => r.fullName).join(', ') || '—'}</td>
                  <td className="small">{p.environments.map((e) => e.name).join(', ') || '—'}</td>
                  <td>{p._count?.deployments ?? 0}</td>
                  <td className="muted small">
                    <TimeAgo iso={p.createdAt} />
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
