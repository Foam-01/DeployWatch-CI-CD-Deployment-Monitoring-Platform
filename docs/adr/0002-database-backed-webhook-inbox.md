# ADR 0002: Database-backed webhook inbox instead of a message broker

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

GitHub delivers webhooks at least once, sometimes late and out of order, and expects a
fast 2xx. Processing (updating runs, emitting notifications) can fail. We need
durability, idempotency and retries without operating extra infrastructure for a
small-team deployment.

## Decision

- Verify the HMAC signature over the raw request body, then insert the event into
  `webhook_events`. The `(provider, delivery_id)` unique constraint is the idempotency
  check: a redelivery fails the insert and is acknowledged as a duplicate.
- Process the event immediately in the request (fast path), but only after it is
  durable. Failures mark the row `FAILED` with `next_attempt_at` (30 s doubling, max
  1 h, 5 attempts).
- A worker claims due rows with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`.
  Rows left `PENDING` by a crash and `PROCESSING` claims older than 5 minutes are
  picked up again, so nothing is lost across restarts.
- Workflow status only moves forward (`QUEUED → IN_PROGRESS → COMPLETED`) using a
  conditional `updateMany`, so a late event can never roll a run back.
- Notification deliveries reuse the same claim/backoff pattern.

## Consequences

- No Redis/RabbitMQ to run, back up or secure; one database transaction model.
- Throughput is bounded by PostgreSQL; fine for thousands of events per minute, not
  for very high volume. Moving to a queue later only replaces the claim step.
- Integration tests run against a real PostgreSQL to prove idempotency, ordering,
  concurrent claims and crash recovery (`webhooks.spec.ts`, `webhook-inbox.spec.ts`).
