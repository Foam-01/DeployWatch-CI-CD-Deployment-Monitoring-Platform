/**
 * Which responsibilities this process has (spec 13.1: API and worker share domain
 * code but must not both run scheduled jobs).
 *   api    — serves HTTP only
 *   worker — runs schedulers (webhook retries, health checks) only, no HTTP server
 *   all    — both; convenient for local development
 */
export type ProcessRole = 'api' | 'worker' | 'all';

export function getProcessRole(): ProcessRole {
  const role = (process.env.PROCESS_ROLE ?? 'all').toLowerCase();
  if (role === 'api' || role === 'worker' || role === 'all') return role;
  throw new Error(`Invalid PROCESS_ROLE "${process.env.PROCESS_ROLE}". Use api, worker or all.`);
}

/** True when this process should execute cron/background jobs. */
export function runsBackgroundJobs(): boolean {
  return getProcessRole() !== 'api';
}
