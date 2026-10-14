# Testing

| Layer | Tool | Where | Database |
|---|---|---|---|
| Unit | Jest | `apps/api/test/unit` | none |
| Integration / API | Jest + Supertest, full Nest app | `apps/api/test/integration` | disposable PostgreSQL (`docker-compose.test.yml`, port 5433) |
| End-to-end | Playwright (desktop + Pixel 7) | `apps/web/e2e` | same disposable PostgreSQL, seeded |

Integration and E2E tests refuse to run against anything but a local database whose
name contains `test`, so they can never wipe development or production data.

## Running

```bash
npm run test:db:up          # disposable Postgres on :5433
npm run test                # unit
npm run test:integration    # API against Postgres
npm run test:e2e            # Playwright (starts its own API :4100 and web :3100)
```

## Latest local run (2026-10-14)

| Suite | Result |
|---|---|
| API unit + integration | 23 suites, **258 passed** |
| E2E (Playwright) | **32 passed** |
| Lint / type check / build | pass |

CI (`.github/workflows/ci.yml`) runs the same commands on every push and pull request.

## Spec critical test cases (§12)

| # | Case | Covered by |
|---|---|---|
| 1 | Same delivery ID twice creates one run | `webhooks.spec.ts` TC-W07, concurrent TC-W08 |
| 2 | Org A cannot read org B | `access-control.spec.ts` TC-I01–I05, `organization-admin.spec.ts` TC-O01–O03 |
| 3 | Viewer cannot edit projects or close incidents | `access-control.spec.ts` TC-R01–R02, E2E viewer tests |
| 4 | Late event does not roll status back | `webhooks.spec.ts` TC-W09, unit `webhook-logic.spec.ts` |
| 5 | Failed notification retried with history | `notifications.spec.ts` TC-N08–N10 |
| 6 | Health timeout counts as failure | `ssrf-guard.spec.ts`, `health-check-scheduler.spec.ts`, `health-state.spec.ts` |
| 7 | Resolve creates incident event + audit log | `incidents.spec.ts` TC-L01–L02 |
| 8 | Archive keeps history | `incidents.spec.ts` TC-L04, environment delete guard TC-E02 |
| 9 | Wrong payload schema rejected | `auth.spec.ts` TC-A03, `webhooks.spec.ts` TC-W02c, DTO tests |
| 10 | Migrations apply from empty | CI applies all migrations to a fresh database each run |

## Bugs found by tests

Writing tests against real infrastructure surfaced defects that were then fixed:
webhooks silently dropped because the raw body was never captured; late events
rolling completed runs back; no SSRF protection on health checks; cross-tenant IDOR
on detail endpoints; viewers able to promote themselves to OWNER; secrets returned by
the API; no login rate limit; unbounded request bodies.

## Not covered

- Load/performance beyond the dashboard benchmark in `docs/performance.md`.
- Real Slack delivery (outbound HTTP is faked in tests; "Send test" exercises it live).
- Browsers other than Chromium.
