'use client';

import Link from 'next/link';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, TimeAgo } from '@/components/ui';
import { useApi } from '@/lib/use-api';
import type { Service } from '@/types/api';

export default function ServicesPage() {
  const { data, error, loading, reload } = useApi<Service[]>('/services');

  return (
    <>
      <PageHeader title="Services" description="HTTP health checks for your deployed services." />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="No services monitored" description="Add a health endpoint from a project's settings." />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Service</th>
                <th scope="col">Project / Env</th>
                <th scope="col">Latency</th>
                <th scope="col">Interval</th>
                <th scope="col">Last check</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const latest = s.healthChecks?.[0];
                return (
                  <tr key={s.id}>
                    <td>
                      <StatusBadge value={s.enabled ? s.currentStatus : 'DISABLED'} />
                    </td>
                    <td>
                      <Link href={`/services/${s.id}`} className="link strong">
                        {s.name}
                      </Link>
                      <div className="muted small mono truncate">{s.healthUrl}</div>
                    </td>
                    <td className="small">
                      {s.project?.name}
                      {s.environment && <div className="muted">{s.environment.name}</div>}
                    </td>
                    <td className="mono">{latest?.latencyMs != null ? `${latest.latencyMs} ms` : '—'}</td>
                    <td className="small">{s.intervalSeconds}s</td>
                    <td className="muted small">
                      <TimeAgo iso={s.lastCheckedAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
