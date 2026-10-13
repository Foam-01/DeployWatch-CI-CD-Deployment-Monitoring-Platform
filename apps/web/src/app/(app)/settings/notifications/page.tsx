'use client';

import { FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  CursorPager,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  TimeAgo,
} from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ALL_EVENTS, EVENT_LABELS } from '@/lib/notification-labels';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { AlertEventType, NotificationChannel, NotificationDelivery } from '@/types/api';

const TYPE_HELP: Record<NotificationChannel['type'], { label: string; placeholder: string; help: string }> = {
  SLACK: {
    label: 'Slack',
    placeholder: 'https://hooks.slack.com/services/…',
    help: 'Create an Incoming Webhook in your Slack app and paste its URL.',
  },
  WEBHOOK: {
    label: 'Webhook',
    placeholder: 'https://ops.example.com/deploywatch',
    help: 'We POST a JSON body { version, event, title, body, url, occurredAt }. Public URLs only.',
  },
};

export default function NotificationSettingsPage() {
  const { orgId, role } = useAuth();
  const allowed = role === 'OWNER' || role === 'ADMIN';
  const base = orgId ? `/organizations/${orgId}/notifications` : null;
  const channels = useApi<NotificationChannel[]>(allowed && base ? `${base}/channels` : null);
  const [deliveriesNonce, setDeliveriesNonce] = useState(0);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Notification channels" />
        <EmptyState title="Access denied" description="Only owners and admins can manage notification channels." />
      </>
    );
  }

  const refreshAll = () => {
    channels.reload();
    setDeliveriesNonce((n) => n + 1);
  };

  return (
    <>
      <PageHeader
        title="Notification channels"
        description="Where DeployWatch sends alerts besides the in-app bell. Destinations are stored encrypted."
      />

      <section className="card" aria-labelledby="channels-h">
        <div className="card-head">
          <h2 id="channels-h">Channels</h2>
        </div>
        {channels.loading && !channels.data ? (
          <LoadingState />
        ) : channels.error ? (
          <ErrorState error={channels.error} onRetry={channels.reload} />
        ) : !channels.data?.length ? (
          <EmptyState title="No channels yet" description="Add Slack or a webhook below to get alerts outside the app." />
        ) : (
          <ul className="list">
            {channels.data.map((c) => (
              <ChannelRow key={c.id} base={base!} channel={c} onChange={refreshAll} />
            ))}
          </ul>
        )}
        <AddChannelForm base={base!} onAdded={refreshAll} />
      </section>

      <DeliveryHistory base={base!} nonce={deliveriesNonce} />
    </>
  );
}

function ChannelRow({ base, channel, onChange }: { base: string; channel: NotificationChannel; onChange: () => void }) {
  const [busy, setBusy] = useState<'test' | 'toggle' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function test() {
    setBusy('test');
    setResult(null);
    try {
      const res = await api.post<{ status: string; errorMsg: string | null }>(`${base}/channels/${channel.id}/test`);
      setResult(
        res.data.status === 'SENT'
          ? { ok: true, text: 'Test message delivered.' }
          : { ok: false, text: res.data.errorMsg ?? 'Delivery failed.' },
      );
      onChange();
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? err.message : 'Test failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    setBusy('toggle');
    try {
      await api.patch(`${base}/channels/${channel.id}`, { enabled: !channel.enabled });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  const events = channel.events.length === 0 ? 'All events' : channel.events.map((e) => EVENT_LABELS[e]).join(', ');

  return (
    <li className="list-row channel-row">
      <StatusBadge value={channel.enabled ? 'ACTIVE' : 'DISABLED'} />
      <div className="list-main">
        <strong>
          {channel.name} <span className="muted small">· {TYPE_HELP[channel.type].label}</span>
        </strong>
        <span className="muted small mono">{channel.destination}</span>
        <span className="muted small">{events}</span>
        {result && (
          <span className={result.ok ? 'success-text small' : 'form-error'} role="status">
            {result.text}
          </span>
        )}
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-sm" onClick={test} disabled={busy !== null || !channel.enabled}>
          {busy === 'test' ? 'Sending…' : 'Send test'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} disabled={busy !== null}>
          {channel.enabled ? 'Disable' : 'Enable'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleting(true)} disabled={busy !== null}>
          Delete
        </button>
      </div>
      <ConfirmDialog
        open={deleting}
        danger
        title={`Delete ${channel.name}?`}
        description="Its delivery history is deleted too. In-app notifications are not affected."
        confirmLabel="Delete channel"
        onConfirm={async () => {
          await api.delete(`${base}/channels/${channel.id}`);
          onChange();
        }}
        onClose={() => setDeleting(false)}
      />
    </li>
  );
}

function AddChannelForm({ base, onAdded }: { base: string; onAdded: () => void }) {
  const [type, setType] = useState<NotificationChannel['type']>('SLACK');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<AlertEventType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (e: AlertEventType) =>
    setEvents((list) => (list.includes(e) ? list.filter((x) => x !== e) : [...list, e]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim() || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/channels`, { type, name: name.trim(), url: url.trim(), events });
      setName('');
      setUrl('');
      setEvents([]);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the channel.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form channel-form" onSubmit={submit}>
      <h3 className="form-title">Add a channel</h3>
      <div className="form-row form-row-3">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as NotificationChannel['type'])}>
            <option value="SLACK">Slack</option>
            <option value="WEBHOOK">Webhook</option>
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="#deploys" maxLength={100} />
        </label>
        <label className="field">
          <span>URL</span>
          <input
            type="url"
            className="mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={TYPE_HELP[type].placeholder}
            maxLength={2048}
          />
        </label>
      </div>
      <p className="muted small">{TYPE_HELP[type].help}</p>

      <fieldset className="event-picker">
        <legend className="small">Events — leave all unchecked to receive everything</legend>
        {ALL_EVENTS.map((ev) => (
          <label key={ev} className="checkbox">
            <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} />
            <span>{EVENT_LABELS[ev]}</span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions form-actions-start">
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !url.trim()}>
          {busy ? 'Adding…' : 'Add channel'}
        </button>
      </div>
    </form>
  );
}

const DELIVERY_FILTERS = ['status'] as const;

function DeliveryHistory({ base, nonce }: { base: string; nonce: number }) {
  const { filters, cursor, cursorStack, setFilter, setCursorStack } = useUrlFilters(DELIVERY_FILTERS);
  // nonce forces a refetch after channel actions (e.g. "Send test").
  const path = `${base}/deliveries${qs({ status: filters.status, cursor, limit: 25, n: nonce || undefined })}`;
  const { data, pagination, error, loading, reload } = useApi<NotificationDelivery[]>(path);

  return (
    <section className="card" aria-labelledby="deliveries-h">
      <div className="card-head">
        <h2 id="deliveries-h">Delivery history</h2>
        <label className="field-inline inline-label">
          <span className="small">Status</span>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
          </select>
        </label>
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="Nothing sent yet" description="Deliveries appear here with their status, attempts and last error." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Notification</th>
                <th scope="col">Channel</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last attempt</th>
                <th scope="col">Next retry / error</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td>
                    <StatusBadge value={d.status === 'SENT' ? 'SUCCESS' : d.status === 'FAILED' ? 'FAILURE' : 'QUEUED'} />
                  </td>
                  <td className="truncate">{d.title}</td>
                  <td className="small">{d.channel.name}</td>
                  <td className="mono">{d.attemptCount}</td>
                  <td className="muted small">
                    <TimeAgo iso={d.lastAttemptAt} />
                  </td>
                  <td className="small">
                    {d.status === 'FAILED' && d.nextAttemptAt ? (
                      <>
                        retry <TimeAgo iso={d.nextAttemptAt} />
                        <div className="form-error truncate">{d.errorMsg}</div>
                      </>
                    ) : d.errorMsg ? (
                      <span className="form-error">{d.errorMsg} — gave up</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
    </section>
  );
}
