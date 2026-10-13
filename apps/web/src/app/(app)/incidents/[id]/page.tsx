'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ErrorState, LoadingState, PageHeader, StatusBadge, TimeAgo } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { Incident } from '@/types/api';

export default function IncidentDetailPage({ params }: { params: { id: string } }) {
  const { canWrite } = useAuth();
  const { data: incident, error, loading, reload } = useApi<Incident>(`/incidents/${params.id}`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !incident) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!incident) return null;

  async function act(kind: 'ack' | 'resolve', e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === 'ack') await api.post(`/incidents/${params.id}/acknowledge`);
      else await api.post(`/incidents/${params.id}/resolve`, { message: note.trim() || undefined });
      setNote('');
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const resolved = incident.status === 'RESOLVED';

  return (
    <>
      <nav className="breadcrumb small" aria-label="Breadcrumb">
        <Link href="/incidents" className="link">
          Incidents
        </Link>{' '}
        / {incident.title}
      </nav>
      <PageHeader
        title={incident.title}
        description={incident.description ?? undefined}
        actions={
          <>
            <StatusBadge value={incident.severity} />
            <StatusBadge value={incident.status} />
          </>
        }
      />

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Timeline</h2>
          </div>
          <ol className="timeline">
            {incident.events?.map((ev) => (
              <li key={ev.id}>
                <div className="timeline-head">
                  <StatusBadge value={ev.eventType} />
                  <span className="muted small">
                    {ev.actorUser?.name ?? 'System'} · <TimeAgo iso={ev.createdAt} />
                  </span>
                </div>
                {ev.message && <p className="small">{ev.message}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Details</h2>
          </div>
          <dl className="details single">
            <div>
              <dt>Service</dt>
              <dd>
                {incident.service?.id ? (
                  <Link href={`/services/${incident.service.id}`} className="link">
                    {incident.service.name}
                  </Link>
                ) : (
                  incident.service?.name ?? '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd>{formatDateTime(incident.openedAt)}</dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{formatDateTime(incident.resolvedAt)}</dd>
            </div>
          </dl>

          {canWrite && !resolved && (
            <form className="form" onSubmit={(e) => act('resolve', e)}>
              {incident.status === 'OPEN' && (
                <button type="button" className="btn" disabled={!!busy} onClick={() => act('ack')}>
                  {busy === 'ack' ? 'Acknowledging…' : 'Acknowledge'}
                </button>
              )}
              <label className="field">
                <span>Resolution note</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="What fixed it?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!!busy}>
                {busy === 'resolve' ? 'Resolving…' : 'Resolve incident'}
              </button>
              {actionError && (
                <p className="form-error" role="alert">
                  {actionError}
                </p>
              )}
            </form>
          )}
          {!canWrite && !resolved && <p className="muted small">Viewers cannot change incident status.</p>}
        </section>
      </div>
    </>
  );
}
