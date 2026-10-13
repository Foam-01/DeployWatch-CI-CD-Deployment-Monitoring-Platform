export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Parses a `limit` query value (string from URL) into a bounded integer. */
export function parseLimit(raw: unknown, fallback = DEFAULT_PAGE_LIMIT): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}
