'use client';

import Link from 'next/link';
import type { ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';

type Tone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

const TONE_BY_VALUE: Record<string, Tone> = {
  SUCCESS: 'success',
  HEALTHY: 'success',
  PASS: 'success',
  RESOLVED: 'success',
  ACTIVE: 'success',
  FAILURE: 'error',
  DOWN: 'error',
  FAIL: 'error',
  TIMEOUT: 'error',
  TIMED_OUT: 'error',
  CRITICAL: 'error',
  OPEN: 'error',
  HIGH: 'warning',
  DEGRADED: 'warning',
  ACKNOWLEDGED: 'warning',
  INVESTIGATING: 'warning',
  ACTION_REQUIRED: 'warning',
  MEDIUM: 'warning',
  IN_PROGRESS: 'info',
  QUEUED: 'info',
  LOW: 'info',
};

/** Status is always conveyed by text as well as color. */
export function StatusBadge({ value }: { value: string | null | undefined }) {
  const label = value ?? 'UNKNOWN';
  const tone = TONE_BY_VALUE[label] ?? 'neutral';
  return <span className={`badge badge-${tone}`}>{label.replace(/_/g, ' ')}</span>;
}

/** Workflow runs show conclusion once completed, otherwise their live status. */
export function RunStatusBadge({ status, conclusion }: { status: string; conclusion: string | null }) {
  return <StatusBadge value={status === 'COMPLETED' ? conclusion ?? 'COMPLETED' : status} />;
}

export function TimeAgo({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="muted">—</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {timeAgo(iso)}
    </time>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {description && <p className="muted">{description}</p>}
      {action}
    </div>
  );
}

/** Renders the right message for network, auth, permission, not-found and server errors. */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.status === 401) {
    return (
      <div className="state" role="alert">
        <p className="state-title">Your session has expired</p>
        <Link className="btn btn-primary" href="/login">
          Sign in again
        </Link>
      </div>
    );
  }
  if (error.status === 403) {
    return (
      <div className="state" role="alert">
        <p className="state-title">Access denied</p>
        <p className="muted">You do not have permission to view this resource.</p>
      </div>
    );
  }
  if (error.status === 404) {
    return (
      <div className="state" role="alert">
        <p className="state-title">Not found</p>
        <p className="muted">This resource does not exist or belongs to another organization.</p>
      </div>
    );
  }
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">Something went wrong</p>
      <p className="muted">{error.message}</p>
      {error.requestId && <p className="mono muted small">Request ID: {error.requestId}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className={`card stat ${tone ? `stat-${tone}` : ''}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}

/**
 * Cursor pagination: the API only returns a "next" cursor, so previous pages are
 * reached by keeping a stack of cursors already visited (stored in the URL).
 */
export function CursorPager({
  hasMore,
  nextCursor,
  cursorStack,
  onNavigate,
}: {
  hasMore: boolean;
  nextCursor?: string;
  cursorStack: string[];
  onNavigate: (stack: string[]) => void;
}) {
  if (!hasMore && cursorStack.length === 0) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <button
        type="button"
        className="btn"
        disabled={cursorStack.length === 0}
        onClick={() => onNavigate(cursorStack.slice(0, -1))}
      >
        ← Previous
      </button>
      <span className="muted small">Page {cursorStack.length + 1}</span>
      <button
        type="button"
        className="btn"
        disabled={!hasMore || !nextCursor}
        onClick={() => nextCursor && onNavigate([...cursorStack, nextCursor])}
      >
        Next →
      </button>
    </nav>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link">
      {children} ↗
    </a>
  );
}
