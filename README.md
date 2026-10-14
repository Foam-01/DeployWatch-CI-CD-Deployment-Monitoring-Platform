# DeployWatch — CI/CD & Deployment Monitoring Platform

> One dashboard for CI runs, deployments, service health, incidents and notifications
> across GitHub, GitLab and Jenkins. Built as a production-oriented portfolio project.

![Dashboard](docs/images/03-dashboard.png)

**Status:** feature-complete for the portfolio scope · 258 API tests + 33 E2E tests passing ·
Docker Compose stack and backup/restore verified (see [Verification](#-verification)).

---

## 📑 Contents

- [Overview](#-overview)
- [Feature tour (with screenshots)](#-feature-tour)
  - [Authentication](#1-authentication)
  - [Overview dashboard](#2-overview-dashboard)
  - [Notification panel](#3-notification-panel)
  - [Projects](#4-projects)
  - [Project settings, alert rules & health checks](#5-project-settings-alert-rules--health-checks)
  - [Workflow runs](#6-workflow-runs)
  - [Deployments & environment comparison](#7-deployments--environment-comparison)
  - [Services & health checks](#8-services--health-checks)
  - [Incidents](#9-incidents)
  - [Notifications & channels](#10-notifications--channels)
  - [Members & roles](#11-members--roles-rbac)
  - [Integrations (GitHub, GitLab, Jenkins)](#12-integrations-github-gitlab-jenkins)
  - [Audit log](#13-audit-log)
  - [Read-only viewer](#14-read-only-viewer)
  - [Mobile](#15-mobile)
  - [API documentation (Swagger)](#16-api-documentation-swagger)
- [Architecture](#-architecture)
- [Technology stack](#-technology-stack)
- [Security](#-security)
- [Quick start](#-quick-start)
- [Demo accounts & data](#-demo-accounts--data)
- [Scripts reference](#-scripts-reference)
- [Configuration](#-configuration)
- [Testing](#-testing)
- [Verification](#-verification)
- [Project structure](#-project-structure)
- [Documentation](#-documentation)
- [Limitations & roadmap](#-limitations--roadmap)
- [Author](#-author) · [License](#-license)

---

## 🚀 Overview

DeployWatch aggregates build pipelines, deployments and service uptime from many
repositories into one multi-tenant command center. It is built around real
infrastructure patterns rather than mock charts:

| Capability | What it does |
|---|---|
| **Provider integrations** | Signed webhooks from GitHub, GitLab and Jenkins; repository/job discovery; encrypted access tokens; sync of recent runs |
| **Reliable ingestion** | HMAC verification on the raw body, `(provider, deliveryId)` idempotency, database inbox processed with `FOR UPDATE SKIP LOCKED` and exponential backoff |
| **Health checks** | Scheduled HTTP probes with failure/recovery thresholds that prevent alert flapping; SSRF-safe outbound HTTP |
| **Incidents** | Opened automatically after sustained downtime, with severity, status workflow and a full timeline |
| **Notifications** | Per-user in-app notifications plus Slack and generic webhook channels with retries and delivery history |
| **Analytics** | 7/30-day workflow-run and deployment trends, deploy success rate, environment comparison |
| **Exports** | CSV export of workflow runs and incidents (filters applied, formula injection neutralised, 10,000-row cap) |
| **Multi-tenancy & RBAC** | Organizations with `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` roles enforced on every route |
| **Audit log** | Who changed what, for members, integrations, channels, projects and incidents |
| **Operations** | Separate worker process, data retention job, backup/restore scripts, non-root Docker images, CI |

---

## 🖼️ Feature tour

All screenshots are generated automatically from the running app against the large
demo dataset (`npm run docs:screenshots -w apps/web`), so they always match the code.

### 1. Authentication

Email/password sign-in. The short-lived access token lives only in memory; the
refresh token is an `HttpOnly` cookie scoped to `/api/v1/auth`, rotated on every refresh.
Login is rate-limited.

| Sign in | Registration with inline validation |
|---|---|
| ![Login](docs/images/01-login.png) | ![Register validation](docs/images/02-register-validation.png) |

### 2. Overview dashboard

- Alert banner for services that are down/degraded and open incidents
- KPI cards: active projects, successful/failed runs, deploy success rate, service health, open incidents
- **Delivery trends**: daily stacked charts of workflow runs and deployments, switchable between 7 and 30 days
- Recent workflow runs and recent deployments, auto-refreshing every 30 seconds

![Dashboard](docs/images/03-dashboard.png)

### 3. Notification panel

The bell shows the unread count and opens a popover (native Popover API: Escape and
outside clicks close it) with the latest notifications. Clicking an item marks it read and
opens the related run, deployment or incident; **Mark all as read** and **View all** are built in.

![Notification panel](docs/images/04-notification-panel.png)

### 4. Projects

Project list with repository links and status. Each project page shows its
environments, latest deployment per environment, recent runs and services.

| Project list | Project detail |
|---|---|
| ![Projects](docs/images/05-projects.png) | ![Project detail](docs/images/06-project-detail.png) |

Creating a project (also creates its default environments in one transaction), and
archiving one behind an accessible confirmation dialog:

| New project | Confirmation dialog |
|---|---|
| ![New project](docs/images/09-new-project.png) | ![Confirm dialog](docs/images/10-confirm-dialog.png) |

### 5. Project settings, alert rules & health checks

Project settings cover the name/description, linked repository, environments,
**alert rules** (override the service-down failure threshold for every service in the
project) and the project's **health checks**.

![Project settings](docs/images/07-project-settings.png)

Health-check URLs are validated against SSRF: private, loopback, link-local and cloud
metadata addresses are rejected — here the AWS metadata endpoint `169.254.169.254`:

![SSRF blocked](docs/images/08-service-form-ssrf-blocked.png)

### 6. Workflow runs

All CI runs across providers with filters (project, branch, status, conclusion),
pagination and **CSV export** that respects the current filters.

| All runs | Filtered to failures |
|---|---|
| ![Workflow runs](docs/images/11-workflow-runs.png) | ![Filtered runs](docs/images/12-workflow-runs-filtered.png) |

Run detail: commit, branch, actor, duration, timing and a link back to the provider.

![Workflow run detail](docs/images/13-workflow-run-detail.png)

### 7. Deployments & environment comparison

Deployment history across environments with status, commit, trigger, duration,
failure reason and links. **Compare environments** shows the latest deployment and
commit of two environments side by side (e.g. what is on staging but not production).

![Deployments](docs/images/14-deployments.png)

### 8. Services & health checks

Every monitored service with current state (`healthy`, `degraded`, `down`), uptime and
latency. The detail page shows uptime over the last 50 checks, average latency,
thresholds, a latency chart, the raw check history and related incidents.

| Services | Service detail |
|---|---|
| ![Services](docs/images/15-services.png) | ![Service detail](docs/images/16-service-detail.png) |

**Anti-flap logic:** a service is marked down only after `failureThreshold` consecutive
failures, and recovers only after `successThreshold` consecutive passes.

### 9. Incidents

Incidents open automatically after sustained downtime (or manually), with severity
(`low` → `critical`) and status (`open` → `investigating` → `monitoring` → `resolved`).
Every change is recorded on the timeline. CSV export is available.

![Incidents](docs/images/17-incidents.png)

| Active incident | Resolved incident timeline |
|---|---|
| ![Incident detail](docs/images/18-incident-detail.png) | ![Resolved timeline](docs/images/19-incident-resolved-timeline.png) |

### 10. Notifications & channels

The notification center lists every in-app notification with read/unread filtering.

![Notifications](docs/images/20-notifications.png)

Owners/admins configure **Slack** and **generic webhook** channels per event type. Channel
secrets are encrypted at rest (AES-256-GCM); Slack URLs are pinned to `hooks.slack.com`.
Failed deliveries are retried on 408/429/5xx, and the **delivery history** shows every attempt.

![Notification channels](docs/images/21-notification-channels.png)

### 11. Members & roles (RBAC)

| Role | Permissions |
|---|---|
| `OWNER` | Everything, including granting/removing owners |
| `ADMIN` | Manage members, integrations, channels, projects |
| `MEMBER` | Manage projects, services, incidents |
| `VIEWER` | Read-only |

Only owners can grant `OWNER`, and the last owner of an organization cannot be removed or demoted.

![Members](docs/images/22-members.png)

### 12. Integrations (GitHub, GitLab, Jenkins)

Connect a provider with a token, discover repositories/jobs, link them to projects and
copy the webhook URL and secret. Tokens and webhook secrets are encrypted at rest.
Setup per provider: [docs/provider-integrations.md](./docs/provider-integrations.md).

![Integrations](docs/images/23-integrations.png)

### 13. Audit log

Every sensitive change — membership and role changes, integrations, channels, projects,
incident updates — is recorded with actor, action, target and time.

![Audit log](docs/images/24-audit-log.png)

### 14. Read-only viewer

Viewers see the same data, but all mutating controls are hidden and the API rejects
writes with `403`.

![Viewer read-only](docs/images/26-viewer-read-only.png)

### 15. Mobile

Every page is responsive; navigation collapses into an accessible drawer.

| Mobile dashboard | Navigation drawer |
|---|---|
| <img src="docs/images/27-mobile-dashboard.png" width="300" alt="Mobile dashboard"> | <img src="docs/images/28-mobile-navigation.png" width="300" alt="Mobile navigation"> |

### 16. API documentation (Swagger)

The REST API (`/api/v1`) is documented with OpenAPI. Swagger UI is served at
`/api/docs` outside production.

![Swagger](docs/images/25-swagger.png)

---

## 🏗️ Architecture

```mermaid
flowchart LR
  GH[GitHub / GitLab / Jenkins] -- signed webhooks --> API
  Browser[Next.js web app] -- REST + JWT --> API[NestJS API]
  API --> DB[(PostgreSQL)]
  Worker[NestJS worker] --> DB
  Worker -- process inbox --> DB
  Worker -- HTTP probes --> Services[Monitored services]
  Worker -- Slack / webhooks --> Channels[Notification channels]
```

- **API** (`PROCESS_ROLE=api`) handles HTTP and stores webhooks in an inbox table — it never processes them inline.
- **Worker** (`PROCESS_ROLE=worker`, `dist/worker.js`) processes the inbox, runs health checks, dispatches notifications and the retention job.
- `PROCESS_ROLE=all` runs both in one process for local development.

Details: [docs/architecture.md](./docs/architecture.md) · [ER diagram](./docs/database.md) · ADRs in [docs/adr](./docs/adr).

---

## 🛠️ Technology stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, plain CSS design system ("Light Engineering", IBM Plex), Lucide icons |
| **Backend** | NestJS 10, TypeScript 5, Passport JWT, class-validator, Swagger/OpenAPI, `@nestjs/schedule`, `@nestjs/throttler`, Helmet |
| **Database** | PostgreSQL 16, Prisma ORM 6 |
| **Testing** | Jest (unit + integration on real PostgreSQL), Supertest, Playwright (desktop + mobile) |
| **DevOps** | Docker multi-stage non-root images, Docker Compose (dev + prod with reverse proxy), GitHub Actions CI |

---

## 🔐 Security

| Control | Implementation |
|---|---|
| Passwords | bcrypt |
| Sessions | In-memory access JWT + rotating `HttpOnly` refresh cookie |
| Tenancy | `OrgGuard` checks membership for every `:orgId` route; queries are always org-scoped |
| RBAC | Role decorators on routes, owner-only role grants, last-owner protection |
| Webhooks | HMAC-SHA256 over the raw body with `timingSafeEqual`, 1 MB body limit, idempotent delivery IDs |
| Secrets at rest | AES-256-GCM (`SecretBox`) with `ENCRYPTION_KEY` |
| SSRF | Connect-time IP validation, no redirects, blocked private/metadata ranges |
| Exports | CSV formula injection neutralised |
| HTTP | Helmet headers, CORS allow-list, rate limiting |

Full write-up: [docs/security.md](./docs/security.md) · [ADR 0004](./docs/adr/0004-ssrf-safe-outbound-http.md).

---

## ⚡ Quick start

### Prerequisites

- Node.js `>= 20`
- Docker & Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/Foam-01/DeployWatch-CI-CD-Deployment-Monitoring-Platform.git
cd DeployWatch-CI-CD-Deployment-Monitoring-Platform
cp .env.example .env
```

Generate an encryption key and put it in `.env` as `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2a. Run everything with Docker Compose

```bash
docker compose up --build
```

- Web: <http://localhost:3000>
- API + Swagger: <http://localhost:4000/api/docs>

Migrations run automatically. `docker compose down` keeps data; `down -v` deletes it.

Production images behind a reverse proxy:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

It serves HTTP on port 80; terminate TLS upstream and forward `X-Forwarded-Proto`.

### 2b. Or run the dev servers

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

### 3. Seed demo data

```bash
npm run db:seed        # small dataset
npm run db:seed:demo   # large realistic dataset used in the screenshots
```

---

## 👥 Demo accounts & data

All demo passwords are `password123`.

| Account | Role |
|---|---|
| `admin@deploywatch.dev` | Owner (Acme Cloud Platform) |
| `sarah@deploywatch.dev`, `mike@…`, `priya@…`, `diego@…`, `nok@…`, `emma@…` | Admins / members |
| `viewer@deploywatch.dev`, `pm@…`, `auditor@…` | Viewers |
| `owner@globex.dev`, `dev@globex.dev` | Second organization (tenant isolation) |

`db:seed:demo` creates 8 projects, ~3,800 workflow runs, ~1,200 deployments, 15 services
with ~5,000 health checks, 30 incidents, ~370 notifications, ~3,800 webhook events and
an audit trail. Notification channels are seeded disabled so no real messages are sent.

Guided walkthrough: [docs/demo.md](./docs/demo.md).

---

## 📜 Scripts reference

| Command | Purpose |
|---|---|
| `npm run dev` | API + web in watch mode |
| `npm run build` / `lint` / `typecheck` | Build and static checks for all workspaces |
| `npm run db:migrate` / `db:seed` / `db:seed:demo` | Database migrations and seed data |
| `npm run test` / `test:integration` | API unit / integration tests |
| `npm run test:db:up` | Start the disposable test PostgreSQL (port 5433) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run docs:screenshots -w apps/web` | Regenerate the README screenshots |
| `npm run db:backup` / `db:restore -- --file … --confirm` | Backup / restore PostgreSQL |
| `npm run benchmark:dashboard -w apps/api` | Dashboard API benchmark |

---

## ⚙️ Configuration

Key variables (see [.env.example](./.env.example) for all of them):

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets |
| `ENCRYPTION_KEY` | 64 hex chars, encrypts integration tokens and channel secrets |
| `PROCESS_ROLE` | `api`, `worker` or `all` |
| `CORS_ORIGIN` | Allowed CORS origin |
| `HEALTH_CHECK_RETENTION_DAYS` | Default 30 |
| `WEBHOOK_EVENT_RETENTION_DAYS` | Default 90 (payloads redacted, rows kept for dedup) |

> Never commit `.env`. It is git-ignored; only `.env.example` with local placeholder values is tracked.

---

## 🧪 Testing

| Layer | Tooling | Coverage |
|---|---|---|
| Unit | Jest | Services, guards, HMAC, SSRF guard, retry, crypto, health-state machine |
| Integration | Jest + Supertest on real PostgreSQL | Auth, RBAC, tenancy, webhooks end-to-end, notifications, exports |
| E2E | Playwright (desktop + mobile) | Login, dashboard, projects, runs, deployments, incidents, settings, viewer restrictions |

Strategy and evidence: [docs/testing.md](./docs/testing.md).

---

## ✅ Verification

| Check | Result | How to reproduce |
|---|---|---|
| Lint, type check, build | pass | `npm run lint && npm run typecheck && npm run build` |
| API unit + integration (real PostgreSQL) | 258 tests pass | `npm run test:db:up && npm run test && npm run test:integration` |
| End-to-end (Playwright) | 33 tests pass | `npm run test:e2e` |
| `docker compose up --build` | all services healthy, migrations applied, login OK | Quick start 2a |
| Backup → data loss → restore | data restored, login OK | [docs/operations.md](./docs/operations.md) |
| CI | all of the above on every push | [.github/workflows/ci.yml](./.github/workflows/ci.yml) |

---

## 📂 Project structure

```
deploywatch/
├── apps/
│   ├── api/                     # NestJS API + worker
│   │   ├── prisma/              # schema, migrations, seed.ts, seed-demo.ts
│   │   ├── src/
│   │   │   ├── auth/            # JWT, refresh cookies, guards
│   │   │   ├── organizations/   # tenants, OrgGuard
│   │   │   ├── memberships/     # members & roles
│   │   │   ├── projects/        # projects, environments, alert rules
│   │   │   ├── repositories/    # provider integrations (GitHub, GitLab, Jenkins)
│   │   │   ├── webhooks/        # HMAC verification, inbox, processor
│   │   │   ├── workflow-runs/   # runs, CSV export
│   │   │   ├── deployments/     # deployments, comparison
│   │   │   ├── health-checks/   # scheduler, SSRF guard, state machine
│   │   │   ├── incidents/       # lifecycle, timeline, CSV export
│   │   │   ├── notifications/   # in-app, channels, dispatcher
│   │   │   ├── audit-logs/      # audit trail
│   │   │   ├── data-retention/  # retention job
│   │   │   ├── health/          # liveness/readiness endpoint
│   │   │   ├── common/          # Prisma, crypto, retry, utils
│   │   │   ├── main.ts          # API entrypoint
│   │   │   └── worker.ts        # worker entrypoint
│   │   └── test/                # unit + integration
│   └── web/                     # Next.js 14 app
│       ├── src/app/             # pages (App Router)
│       ├── src/components/      # app shell, UI kit, notification bell
│       └── e2e/                 # Playwright tests + screenshot generator
├── docs/                        # architecture, security, testing, ops, ADRs, images
├── infra/                       # reverse proxy config
├── scripts/                     # backup / restore
├── docker-compose.yml           # dev stack
├── docker-compose.prod.yml      # production stack
└── .github/workflows/ci.yml     # CI
```

---

## 📚 Documentation

| Topic | Document |
|---|---|
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| Database & ER diagram | [docs/database.md](./docs/database.md) |
| Security | [docs/security.md](./docs/security.md) |
| Testing | [docs/testing.md](./docs/testing.md) |
| Operations, backup & restore | [docs/operations.md](./docs/operations.md) |
| Provider setup | [docs/provider-integrations.md](./docs/provider-integrations.md) |
| Demo walkthrough | [docs/demo.md](./docs/demo.md) |
| Performance | [docs/performance.md](./docs/performance.md) |
| Decisions | [ADR 0001](./docs/adr/0001-modular-api-worker.md) · [ADR 0002](./docs/adr/0002-database-backed-webhook-inbox.md) · [ADR 0003](./docs/adr/0003-auth-tokens-and-tenancy.md) · [ADR 0004](./docs/adr/0004-ssrf-safe-outbound-http.md) |

---

## 🗺️ Limitations & roadmap

- Not yet hosted on a public staging/production server
- No email verification or password reset yet
- No external security audit; load testing limited to the [dashboard benchmark](./docs/performance.md)
- Ideas: SSO (OIDC), more providers (Bitbucket, CircleCI), DORA metrics, PagerDuty/Teams channels

---

## 👤 Author

- **Foam** — Junior Full-Stack Developer
- GitHub: [@Foam-01](https://github.com/Foam-01)
- Portfolio: [portfoliof-01.netlify.app](https://portfoliof-01.netlify.app)

## 📄 License

[MIT](./LICENSE) © 2026 Foam
