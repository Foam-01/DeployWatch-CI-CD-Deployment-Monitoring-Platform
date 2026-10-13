# ADR 0001: Modular API and worker processes with PostgreSQL

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

DeployWatch accepts external GitHub events, performs scheduled health probes, retries
failed background work, and serves an interactive dashboard. Request handling should
remain responsive while scheduled jobs run, and event deliveries must be idempotent
across request and worker processes. The application is a single product with one
relational data model and a small number of services.

## Decision

- Keep domain code in a modular NestJS application and run it as separate API and
  worker processes, selected by `PROCESS_ROLE`.
- Use PostgreSQL as the source of truth for application data, webhook inbox state,
  notification delivery state, and job coordination.
- Use unique database constraints for delivery idempotency and atomic
  `FOR UPDATE SKIP LOCKED` claims for webhook retries.
- Use Prisma migrations to version schema changes and Compose to orchestrate local
  development and production services.

## Consequences

- API and worker share domain modules and are built from the same source, reducing
  duplicated business logic.
- The Compose deployment runs one worker service so periodic schedulers have one
  active owner; inbox claims remain coordinated through PostgreSQL.
- PostgreSQL availability is required for both request processing and background
  work.
- A dedicated message broker or independently deployable domain services may become
  appropriate if throughput or isolation needs grow; they are not introduced until
  operational requirements justify the additional infrastructure.
