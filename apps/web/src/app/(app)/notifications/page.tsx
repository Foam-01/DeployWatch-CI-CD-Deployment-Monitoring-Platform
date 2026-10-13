'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CursorPager, EmptyState, ErrorState, LoadingState, PageHeader, TimeAgo } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { EVENT_LABELS, eventTone } from '@/lib/notification-labels';
import { useApi } from '@/lib/use-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { AppNotification } from '@/types/api';

const FILTER_KEYS = ['show'] as const;

export default function NotificationsPage() {
  const router = useRouter();
  const { role } = useAuth();
  const { filters, cursor, cursorStack, setFilter, setCursorStack } = useUrlFilters(FILTER_KEYS);
  const unreadOnly = filters.show === 'unread';
  const { data, pagination, error, loading, reload } = useApi<AppNotification[]>(
    `/notifications${qs({ unread: unreadOnly ? 'true' : undefined, cursor, limit: 30 })}`,
  );
  const [marking, setMarking] = useState(false);
  const hasUnread = (data ?? []).some((n) => !n.readAt);

  async function markAll() {
    setMarking(true);
    try {
      await api.post('/notifications/read', {});
      reload();
      window.dispatchEvent(new Event('deploywatch:notifications-read'));
    } finally {
      setMarking(false);
    }
  }

  async function open(n: AppNotification) {
    if (!n.readAt) await api.post('/notifications/read', { ids: [n.id] }).catch(() => undefined);
    if (n.link) router.push(n.link);
    else reload();
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Failures, outages and recoveries across your organization."
        actions={
          <>
            {(role === 'OWNER' || role === 'ADMIN') && (
              <Link href="/settings/notifications" className="btn btn-ghost">
                Channels
              </Link>
            )}
            <button type="button" className="btn" onClick={markAll} disabled={marking || !hasUnread}>
              Mark all as read
            </button>
          </>
        }
      />

      <div className="segmented" role="tablist" aria-label="Filter notifications">
        <button
          type="button"
          role="tab"
          aria-selected={!unreadOnly}
          className={!unreadOnly ? 'active' : ''}
          onClick={() => setFilter('show', '')}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={unreadOnly}
          className={unreadOnly ? 'active' : ''}
          onClick={() => setFilter('show', 'unread')}
        >
          Unread
        </button>
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState
          title={unreadOnly ? 'You are all caught up' : 'No notifications yet'}
          description={unreadOnly ? undefined : 'Failed workflows, failed deploys and service outages will appear here.'}
        />
      ) : (
        <ul className="card notification-list">
          {data.map((n) => (
            <li key={n.id}>
              <button type="button" className={`notification-row ${n.readAt ? '' : 'unread'}`} onClick={() => open(n)}>
                <span className={`badge badge-${eventTone(n.eventType)}`}>{EVENT_LABELS[n.eventType]}</span>
                <span className="notification-main">
                  <strong>{n.title}</strong>
                  {n.body && <span className="muted small">{n.body}</span>}
                </span>
                <span className="muted small nowrap">
                  <TimeAgo iso={n.createdAt} />
                </span>
                {!n.readAt && <span className="unread-dot" aria-label="Unread" />}
              </button>
            </li>
          ))}
        </ul>
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
