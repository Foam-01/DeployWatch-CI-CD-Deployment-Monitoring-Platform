'use client';

import Link from 'next/link';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge, TimeAgo } from '@/components/ui';
import { useApi } from '@/lib/use-api';
import type { HealthCheck, Service } from '@/types/api';

export default function ServiceDetailPage({ params }: { params: { id: string } }) {
  const service = useApi<Service>(`/services/${params.id}`);
  const history = useApi<HealthCheck[]>(`/services/${params.id}/health-history?limit=50`);

  if (service.loading) return <LoadingState />;
  if (service.error) return <ErrorState error={service.error} onRetry={service.reload} />;
  const s = service.data;
  if (!s) return null;

  const checks = history.data ?? [];
  const passed = checks.filter((c) => c.status === 'PASS').length;
  const latencies = checks.map((c) => c.latencyMs).filter((n): n is number => n !== null);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const maxLatency = latencies.length ? Math.max(...latencies) : 0;

  return (
    <>
      <nav className="breadcrumb small" aria-label="Breadcrumb">
        <Link href="/services" className="link">
          Services
        </Link>{' '}
        / {s.name}
      </nav>
      <PageHeader
        title={s.name}
        description={s.healthUrl}
        actions={<StatusBadge value={s.enabled ? s.currentStatus : 'DISABLED'} />}
      />

      <section className="stat-grid">
        <StatCard
          label={`Uptime (last ${checks.length} checks)`}
          value={checks.length ? `${Math.round((passed / checks.length) * 100)}%` : '—'}
        />
        <StatCard label="Avg latency" value={avgLatency === null ? '—' : `${avgLatency} ms`} />
        <StatCard label="Expected status" value={s.expectedHttpStatus} />
        <StatCard
          label="Thresholds"
          value={`${s.failureThreshold} / ${s.successThreshold}`}
          hint="Failures to open / passes to recover"
        />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Latency</h2>
          <span className="muted small">
            Interval {s.intervalSeconds}s · timeout {s.timeoutMs} ms
          </span>
        </div>
        {history.loading ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={history.reload} />
        ) : checks.length === 0 ? (
          <EmptyState title="No health checks recorded yet" />
        ) : (
          <>
            <div className="latency-bars" role="img" aria-label={`Latency of the last ${checks.length} checks`}>
              {[...checks].reverse().map((c) => (
                <span
                  key={c.id}
                  className={`bar ${c.status === 'PASS' ? 'bar-ok' : 'bar-fail'}`}
                  style={{ height: `${Math.max(6, ((c.latencyMs ?? maxLatency) / (maxLatency || 1)) * 100)}%` }}
                  title={`${c.status} · ${c.latencyMs ?? '—'} ms · ${new Date(c.checkedAt).toLocaleString()}`}
                />
              ))}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Result</th>
                    <th scope="col">HTTP</th>
                    <th scope="col">Latency</th>
                    <th scope="col">Error</th>
                    <th scope="col">Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.slice(0, 20).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <StatusBadge value={c.status} />
                      </td>
                      <td className="mono">{c.httpStatus ?? '—'}</td>
                      <td className="mono">{c.latencyMs != null ? `${c.latencyMs} ms` : '—'}</td>
                      <td className="small">{c.errorMsg ?? '—'}</td>
                      <td className="muted small">
                        <TimeAgo iso={c.checkedAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Incidents</h2>
        </div>
        {!s.incidents?.length ? (
          <EmptyState title="No incidents for this service" />
        ) : (
          <ul className="list">
            {s.incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/incidents/${i.id}`} className="list-row">
                  <StatusBadge value={i.status} />
                  <div className="list-main">
                    <strong>{i.title}</strong>
                  </div>
                  <StatusBadge value={i.severity} />
                  <span className="muted small">
                    <TimeAgo iso={i.openedAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
