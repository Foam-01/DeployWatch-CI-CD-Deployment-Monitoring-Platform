# Operations

## Processes

| Process | Command | Port | Runs schedulers |
|---|---|---|---|
| API | `npm run start:prod -w apps/api` (`PROCESS_ROLE=api`) | 4000 | no |
| Worker | `npm run start:worker -w apps/api` (`PROCESS_ROLE=worker`) | none | webhook retries, notification dispatch, health checks, retention |
| Web | `npm run start -w apps/web` | 3000 | — |
| PostgreSQL | Compose `postgres` service | internal only in production | — |

Run exactly one worker per database unless you have verified your own scheduling;
webhook and notification claims are safe across workers (`FOR UPDATE SKIP LOCKED`),
but health checks and retention are scheduled per process.

Health endpoint: `GET /api/v1/health` reports API status and database connectivity
and is used by the Compose health checks.

## Required configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing — the API refuses to start without `JWT_SECRET` |
| `ENCRYPTION_KEY` | 64 hex chars (AES-256-GCM key for stored secrets). **Losing it makes stored webhook secrets and channel URLs unreadable — back it up separately from the database.** |
| `CORS_ORIGIN`, `APP_URL` | Web origin (CORS allow-list and links in notifications) |
| `PROCESS_ROLE` | `api`, `worker` or `all` (local development) |
| `HEALTH_CHECK_RETENTION_DAYS`, `WEBHOOK_EVENT_RETENTION_DAYS` | Retention, defaults 30 / 90 |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Backup and restore

Backups are taken from the Compose `postgres` service with `pg_dump --format=custom`.

```bash
npm run db:backup                                    # → backups/deploywatch-<timestamp>.dump
npm run db:backup -- --file backups/before-upgrade.dump
npm run db:restore -- --file backups/before-upgrade.dump --confirm
```

Restore first validates the archive with `pg_restore --list`, then runs
`pg_restore --clean --if-exists --exit-on-error`. It replaces objects in the database
of the Compose `postgres` service only.

### Restore test (performed 2026-10-14, Docker Compose dev stack, seeded demo data)

| Step | projects | workflow_runs | users |
|---|---|---|---|
| Before backup | 2 | 3 | 2 |
| After `DELETE FROM projects` (simulated loss) | 0 | 0 | 2 |
| After `npm run db:restore -- --confirm` | 2 | 3 | 2 |

`POST /api/v1/auth/login` returned 200 after the restore. Backup size: 61 KB.

Recommended schedule for a real deployment: daily backup, kept off-host, with a
restore drill after every schema-changing release.

## Releasing

1. CI must pass (lint, type check, unit, integration against PostgreSQL, build, E2E).
2. Take a backup.
3. Apply migrations explicitly: `docker compose run --rm migrate` (or
   `npm run db:migrate:prod -w apps/api`). Migrations are additive; never run a
   destructive migration without a planned backup.
4. Start the new API, worker and web images; confirm `/api/v1/health` and log in.
5. Roll back by redeploying the previous image tag; restore the backup only if a
   migration must be reverted.

## Rotating secrets

- **Webhook secret for a repository:** unlink and re-link the repository; the new
  secret is shown once — update it in GitHub.
- **Notification channel URL:** edit the channel (the old URL is replaced, never shown).
- **`JWT_SECRET`:** changing it signs everyone out.
- **`ENCRYPTION_KEY`:** not supported in place yet — it requires re-encrypting all
  stored secrets with the new key.
