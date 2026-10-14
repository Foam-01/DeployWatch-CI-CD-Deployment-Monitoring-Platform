# DeployWatch — CI/CD & Deployment Monitoring Platform

> A production-oriented portfolio project: one dashboard for GitHub Actions runs,
> deployments, service health, incidents and notifications.

**Status:** feature-complete for the portfolio scope · 258 API tests + 32 E2E tests passing locally ·
Docker Compose stack and backup/restore verified (see [Verification](#-verification)).

---

## 🚀 Overview

**DeployWatch** is a centralized CI/CD observability and health monitoring platform designed to aggregate build pipelines, production deployments, and microservice uptime across multiple repositories into a unified command center.

Instead of mock charts, DeployWatch implements real-world infrastructure patterns:
- **GitHub, GitLab & Jenkins Integrations**: Ingests signed webhooks, discovers repositories/jobs through provider APIs, encrypts access credentials, and syncs recent CI runs.
- **Automated Health Checking & Flapping Prevention**: Configurable synthetic probes with failure/recovery thresholds (e.g., 3 consecutive failures before alerting) to eliminate transient alert flapping.
- **Project Alert Rules**: Owners/admins can override the service-down failure threshold for every service in a project; per-service thresholds remain the fallback.
- **Delivery Analytics**: Organization-scoped daily workflow-run and deployment trends for the last 7 or 30 days.
- **CSV Exports**: Download organization-scoped workflow-run and incident reports; current filters are applied, spreadsheet formulas are neutralized, and exports are capped at 10,000 rows.
- **Deployment Comparison**: Compare the latest recorded commits and deployment status between two environments in a project.
- **Incident Lifecycle Management**: Opens incidents after sustained downtime, notifies configured channels, and records an incident timeline. Recovery updates service state; operators resolve incidents explicitly.
- **Notification Center**: Per-user in-app notifications and configurable Slack/webhook channels with delivery history and retries.
- **Modern Responsive UI**: Next.js 14 App Router with the Light Engineering design system, responsive layouts, loading, empty, and error states.

### Documentation

| Topic | Document |
|---|---|
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| Database & ER diagram | [docs/database.md](./docs/database.md) |
| Security controls | [docs/security.md](./docs/security.md) |
| Testing strategy & evidence | [docs/testing.md](./docs/testing.md) |
| Operations, backup & restore | [docs/operations.md](./docs/operations.md) |
| Provider setup (GitHub, GitLab, Jenkins) | [docs/provider-integrations.md](./docs/provider-integrations.md) |
| Demo walkthrough | [docs/demo.md](./docs/demo.md) |
| Performance benchmark | [docs/performance.md](./docs/performance.md) |
| API reference | Swagger UI at `/api/docs` when the API runs outside production |
| Decisions | [ADR 0001](./docs/adr/0001-modular-api-worker.md) modular API + worker · [ADR 0002](./docs/adr/0002-database-backed-webhook-inbox.md) webhook inbox · [ADR 0003](./docs/adr/0003-auth-tokens-and-tenancy.md) auth & tenancy · [ADR 0004](./docs/adr/0004-ssrf-safe-outbound-http.md) SSRF |

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, Vanilla CSS Design System, Lucide Icons |
| **Backend** | NestJS 10, TypeScript 5, Passport JWT, Swagger/OpenAPI, `@nestjs/schedule` |
| **Database & ORM**| PostgreSQL 16, Prisma ORM 6 |
| **Security** | HMAC-SHA256 GitHub Webhook validation, bcrypt password hashing, encrypted integration secrets, Role-Based Access Control (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) |
| **DevOps & Containers** | Docker, Docker Compose, Multi-stage production container builds |

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js**: `>= 20.0.0`
- **Docker & Docker Compose** (for PostgreSQL)

### 2. Environment Setup
```bash
# Clone the repository
git clone https://github.com/Foam-01/DeployWatch-CI-CD-Deployment-Monitoring-Platform.git
cd DeployWatch-CI-CD-Deployment-Monitoring-Platform

# Copy environment variables
cp .env.example .env
```

### 3. Start the Docker Compose stack

Generate a dedicated encryption key before starting the app:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the output as `ENCRYPTION_KEY` in `.env`, then start PostgreSQL, run migrations,
and launch the API, worker, and web app:

```bash
docker compose up --build
```

The app is available at [http://localhost:3000](http://localhost:3000), and the API
and Swagger docs at [http://localhost:4000/api/docs](http://localhost:4000/api/docs).
Compose runs database migrations automatically before starting the API and worker.
To stop the stack, run `docker compose down`; the PostgreSQL data remains in its named
volume. Use `docker compose down -v` only when you intentionally want to delete that data.

For the production images and reverse proxy, configure production secrets in `.env`,
then run `docker compose -f docker-compose.prod.yml up --build -d`. This stack serves
HTTP on port 80; terminate TLS at an upstream load balancer or reverse proxy and have
it forward `X-Forwarded-Proto`.

### 4. Seed demo data (optional)

With the Compose stack running, seed the database from the repository root:

```bash
npm run db:seed -w apps/api
```

The seed command uses `DATABASE_URL` from `.env` (defaulting to the local PostgreSQL
port). If you changed the Compose database credentials or port, update `DATABASE_URL`
to match before running the seed.

**Seed Credentials**:
- **Admin**: `admin@deploywatch.dev` / `password123`
- **Developer**: `sarah@deploywatch.dev` / `password123`

### 5. Database backup and restore

Create a PostgreSQL custom-format backup from the running Compose database:

```bash
npm run db:backup
# Optional explicit destination:
npm run db:backup -- --file backups/before-upgrade.dump
```

Restore a backup to the database configured by the Compose `postgres` service:

```bash
npm run db:restore -- --file backups/before-upgrade.dump --confirm
```

Restore validates the archive before changing data. It replaces matching database
objects, so take a backup first and stop application/worker writes while restoring.
Backups may contain encrypted secrets and production data; store them securely and
outside version control. The default `backups/` directory is git-ignored.

The worker runs a daily retention job: health-check rows older than
`HEALTH_CHECK_RETENTION_DAYS` (default 30) are deleted. Payloads from processed or
terminally failed webhook events older than `WEBHOOK_EVENT_RETENTION_DAYS` (default 90)
are redacted, while the inbox rows remain to preserve delivery-ID deduplication.

For a guided walkthrough using the seeded account and demo records, see
[docs/demo.md](./docs/demo.md).

### 6. Start Development Servers
```bash
# Run both Backend API and Web Frontend concurrently
npm run dev
```

- **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Swagger Docs**: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

---

## 💡 Key Engineering Features

### 1. GitHub Webhook Security & Idempotency
- Validates the `X-Hub-Signature-256` header against the repository's configured secret using constant-time string comparison (`crypto.timingSafeEqual`) to prevent timing attacks.
- Prevents duplicated event processing via a database unique constraint on `(provider, delivery_id)`.

### 2. Anti-Flap Synthetic Probes
- Rather than alerting on a single 500 error or network blip, the scheduler requires `failure_threshold` consecutive failures before opening an incident.
- When the service recovers, it requires `success_threshold` consecutive passing checks before restoring the service status. The incident remains open until an operator resolves it.

---

## ✅ Verification

What has actually been run, so claims here can be checked:

| Check | Result | How to reproduce |
|---|---|---|
| Lint, type check, build | pass | `npm run lint && npm run typecheck && npm run build` |
| API unit + integration (real PostgreSQL) | 23 suites, 258 tests pass | `npm run test:db:up && npm run test && npm run test:integration` |
| End-to-end (Playwright, desktop + mobile) | 32 tests pass | `npm run test:e2e` |
| `docker compose up --build` | postgres, api, web healthy; migrations applied; worker running; login OK | Quick Start step 3 |
| Backup → simulated data loss → restore | data restored, login OK | [docs/operations.md](./docs/operations.md#restore-test-performed-2026-10-14-docker-compose-dev-stack-seeded-demo-data) |
| CI | runs all of the above on every push | [.github/workflows/ci.yml](./.github/workflows/ci.yml) |

Not done: external security audit, load testing beyond the
[dashboard benchmark](./docs/performance.md), staging/production hosting.

---

## 📂 Project Directory Structure

```
deploywatch/
├── apps/
│   ├── api/                   # NestJS Backend API
│   │   ├── prisma/            # Schema definition & rich seed script
│   │   └── src/
│   │       ├── auth/          # JWT Auth & Organization RBAC
│   │       ├── webhooks/      # GitHub webhook receiver & HMAC verification
│   │       ├── health-checks/ # Synthetic scheduler & flapping prevention
│   │       ├── incidents/     # Incident lifecycle management
│   │       ├── deployments/   # Deployment records & velocity metrics
│   │       ├── projects/      # Multi-tenant project administration
│   │       └── common/        # Prisma service & shared interceptors
│   └── web/                   # Next.js 14 Frontend Web Application
│       └── src/
│           └── app/           # App Router pages, design system & dashboard
├── docker-compose.yml         # Local development application stack
└── package.json               # Monorepo workspace configuration
```

---

## 👤 Author & Portfolio
- **Author**: Foam — Junior Full-Stack Developer
- **GitHub**: [@Foam-01](https://github.com/Foam-01)
- **Portfolio**: [portfoliof-01.netlify.app](https://portfoliof-01.netlify.app)

---

## 📄 License
MIT License © 2026 Foam. Built for Junior Full-Stack Developer Portfolio Showcase.
