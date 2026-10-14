'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, TimeAgo } from '@/components/ui';
import { ApiError, downloadFile, qs } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { Incident } from '@/types/api';

const FILTER_KEYS = ['status', 'severity'] as const;

export default function IncidentsPage() {
  const { filters, setFilter } = useUrlFilters(FILTER_KEYS);
  const { data, error, loading, reload } = useApi<Incident[]>(
    `/incidents${qs({ status: filters.status, severity: filters.severity })}`,
  );

  const incidents = data ?? [];
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const hasFilters = Boolean(filters.status || filters.severity);

  async function exportIncidents() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadFile(`/incidents/export.csv${qs(filters)}`, 'incidents.csv');
    } catch (cause) {
      setExportError(cause instanceof ApiError ? cause.message : 'Could not export incidents.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Opened automatically when a service fails its threshold."
        actions={
          <button className="btn btn-ghost" type="button" onClick={exportIncidents} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />
      {exportError && (
        <div className="state state-error" role="alert">
          <p className="state-title">{exportError}</p>
        </div>
      )}

      <div className="toolbar" role="search">
        <label className="field-inline">
          <span className="muted small">Status</span>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Any</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <label className="field-inline">
          <span className="muted small">Severity</span>
          <select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
            <option value="">Any</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : incidents.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No incidents match these filters' : 'No incidents'}
          description={hasFilters ? undefined : 'All monitored services are within their thresholds.'}
        />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Severity</th>
                <th scope="col">Incident</th>
                <th scope="col">Service</th>
                <th scope="col">Opened</th>
                <th scope="col">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td>
                    <StatusBadge value={i.status} />
                  </td>
                  <td>
                    <StatusBadge value={i.severity} />
                  </td>
                  <td>
                    <Link href={`/incidents/${i.id}`} className="link strong">
                      {i.title}
                    </Link>
                  </td>
                  <td className="small">
                    {i.service?.name ?? '—'}
                    {i.service?.project && <div className="muted">{i.service.project.name}</div>}
                  </td>
                  <td className="muted small">
                    <TimeAgo iso={i.openedAt} />
                  </td>
                  <td className="muted small">
                    <TimeAgo iso={i.resolvedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
