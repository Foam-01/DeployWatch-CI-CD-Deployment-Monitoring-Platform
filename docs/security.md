# Security

Status of the spec §11.6 checklist, with where each control lives and how it is verified.

| Control | Implementation | Verified by |
|---|---|---|
| Input validation | DTOs + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`); 1 MB JSON limit, 413 with error contract | `auth.spec.ts` TC-A03, `webhooks.spec.ts` TC-W12 |
| CORS allow-list | `CORS_ORIGIN`, credentials only for that origin | config (`app.setup.ts`) |
| Security headers | `helmet()` | config |
| Rate limiting | global throttler; login limited per (IP, email) | `auth.spec.ts` TC-A09 |
| Password hashing | bcrypt, cost 12 | `auth.spec.ts` TC-A02 |
| Tokens | 15 min access token in memory; refresh token HttpOnly SameSite cookie ([ADR 0003](adr/0003-auth-tokens-and-tenancy.md)) | `auth.spec.ts` TC-A01/A07, E2E session test |
| RBAC + organization isolation | `OrgGuard` + per-query org filter; 404 across tenants | `access-control.spec.ts`, `organization-admin.spec.ts` |
| Webhook signatures | HMAC-SHA256 over raw body, constant-time compare; unknown repo or missing secret = 401 | `webhooks.spec.ts` TC-W01–W06, unit `webhook-logic.spec.ts` |
| Replay / duplicates | unique `(provider, delivery_id)` | `webhooks.spec.ts` TC-W07–W08 |
| SSRF | connect-time IP checks, no redirects, deadlines ([ADR 0004](adr/0004-ssrf-safe-outbound-http.md)) | `ssrf-guard.spec.ts`, `services.spec.ts` |
| Secrets at rest | AES-256-GCM for webhook secrets, provider tokens, channel URLs | `secret-box.spec.ts`, `webhook-inbox.spec.ts` TC-Q08, `notifications.spec.ts` TC-N01 |
| Secret redaction | secrets never returned (shown once on creation, then masked); payload logs exclude secrets | `access-control.spec.ts` TC-S01–S03 |
| Audit log | membership, organization, incident and channel changes, in the same transaction | `organization-admin.spec.ts` TC-O10, `incidents.spec.ts` TC-L02 |
| Dependency audit | `npm audit --audit-level=high` in CI (non-blocking) | CI |
| Backup & restore | `npm run db:backup` / `db:restore`, restore drill recorded in [operations.md](operations.md) | manual drill 2026-10-14 |
| Containers | multi-stage images, non-root users, `.dockerignore` excludes `.env` and git history | Dockerfiles |

## Out of scope by design

DeployWatch never executes commands supplied from the dashboard; deployments are
performed by predefined GitHub Actions workflows and only reported here (spec §11.5).

## Known gaps

- Email verification and password reset are not implemented (registration is meant
  for demo use).
- Refresh tokens cannot be revoked server-side before they expire.
- `ENCRYPTION_KEY` rotation requires a manual re-encryption step.
- No external penetration test or security audit has been performed.

## Reporting

Please report vulnerabilities privately to the repository owner rather than opening
a public issue.
