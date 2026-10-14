'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { EVENT_LABELS, eventTone } from '@/lib/notification-labels';
import { useApi } from '@/lib/use-api';
import type { AppNotification } from '@/types/api';
import { TimeAgo } from './ui';

const BELL_POLL_MS = 30_000;
const PREVIEW_LIMIT = 8;
const PANEL_ID = 'notification-panel';

/**
 * Bell with an unread badge that opens a panel of recent notifications in place.
 * The panel uses the native Popover API (modern-web-guidance): Escape and clicking
 * outside close it, and it renders in the top layer above every other element.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = useApi<{ count: number }>('/notifications/unread-count');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const reloadCount = unread.reload;

  const loadItems = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<AppNotification[]>(`/notifications?limit=${PREVIEW_LIMIT}`);
      setItems(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load notifications.');
    }
  }, []);

  // Keep the badge fresh: on navigation, when the full page marks things read, and every 30s.
  useEffect(() => {
    reloadCount();
  }, [pathname, reloadCount]);

  useEffect(() => {
    const onRead = () => reloadCount();
    window.addEventListener('deploywatch:notifications-read', onRead);
    const id = setInterval(() => document.visibilityState === 'visible' && reloadCount(), BELL_POLL_MS);
    return () => {
      window.removeEventListener('deploywatch:notifications-read', onRead);
      clearInterval(id);
    };
  }, [reloadCount]);

  // Track the popover's open state and anchor it under the bell when it opens.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === 'open';
      setOpen(isOpen);
      if (isOpen) {
        setItems(null);
        const rect = buttonRef.current!.getBoundingClientRect();
        panel.style.top = `${rect.bottom + 8}px`;
        panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
        loadItems();
      }
    };
    panel.addEventListener('toggle', onToggle);
    return () => panel.removeEventListener('toggle', onToggle);
  }, [loadItems]);

  // Close when the route changes (e.g. after following a notification).
  useEffect(() => {
    panelRef.current?.hidePopover?.();
  }, [pathname]);

  async function openItem(n: AppNotification) {
    if (!n.readAt) {
      await api.post('/notifications/read', { ids: [n.id] }).catch(() => undefined);
      reloadCount();
    }
    panelRef.current?.hidePopover();
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    setMarking(true);
    try {
      await api.post('/notifications/read', {});
      await loadItems();
      reloadCount();
      window.dispatchEvent(new Event('deploywatch:notifications-read'));
    } finally {
      setMarking(false);
    }
  }

  const count = unread.data?.count ?? 0;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn bell"
        popoverTarget={PANEL_ID}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      >
        <Bell size={18} aria-hidden />
        {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
      </button>

      <div ref={panelRef} id={PANEL_ID} popover="auto" className="notification-panel" role="dialog" aria-label="Notifications">
        <div className="notification-panel-head">
          <strong>Notifications</strong>
          {count > 0 && <span className="muted small">{count} unread</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={markAll} disabled={marking || count === 0}>
            Mark all as read
          </button>
        </div>

        <div className="notification-panel-body">
          {!open ? null : error ? (
            <div className="panel-state">
              <p className="form-error">{error}</p>
              <button type="button" className="btn btn-sm" onClick={loadItems}>
                Retry
              </button>
            </div>
          ) : items === null ? (
            <div className="panel-state" role="status">
              <span className="spinner" aria-hidden />
              <span className="muted small">Loading…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="panel-state">
              <p className="muted">No notifications yet.</p>
            </div>
          ) : (
            <ul className="panel-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`panel-item ${n.readAt ? '' : 'unread'}`}
                    onClick={() => openItem(n)}
                  >
                    <span className={`badge badge-${eventTone(n.eventType)}`}>{EVENT_LABELS[n.eventType]}</span>
                    <span className="panel-item-title">{n.title}</span>
                    {n.body && <span className="panel-item-body muted small">{n.body}</span>}
                    <span className="muted small">
                      <TimeAgo iso={n.createdAt} />
                    </span>
                    {!n.readAt && <span className="unread-dot" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/notifications" className="notification-panel-foot" onClick={() => panelRef.current?.hidePopover()}>
          View all notifications
        </Link>
      </div>
    </>
  );
}
