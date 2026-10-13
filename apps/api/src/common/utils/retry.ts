/** Shared retry policy for background work (webhook inbox, notification deliveries). */
export const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
/** A claim older than this belongs to a worker that crashed mid-job. */
export const STALE_LOCK_MS = 5 * 60_000;

/** Delay before retry N (1-based): 30s, 60s, 120s, 240s … capped at 1h. */
export function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}
