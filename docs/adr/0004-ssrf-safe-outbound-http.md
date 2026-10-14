# ADR 0004: Validate outbound destinations at connect time (SSRF)

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Users configure URLs the server will call: health endpoints, webhook notification
channels and self-hosted GitLab/Jenkins. Without protection, a user could make the
server request `http://169.254.169.254/` (cloud metadata), `localhost` or private
networks. Checking the URL string is not enough: a public hostname can resolve to a
private address, or re-resolve between validation and use (DNS rebinding).

## Decision

- One outbound client (`health-checks/ssrf-guard.ts`) for all user-supplied URLs.
- Only `http`/`https`, no credentials in the URL, no `localhost` / `*.internal` names.
- Every resolved address is checked inside the socket's own DNS lookup against a
  block list (loopback, RFC 1918, CGNAT, link-local incl. metadata, multicast,
  reserved, IPv6 ULA/link-local, NAT64, IPv4-mapped IPv6). The connection is made to
  the exact address that was checked, which defeats rebinding.
- Redirects are never followed; only the status line is read (body never downloaded);
  every request has a hard deadline covering DNS, connect, TLS and first byte.
- URLs are also validated when saved, so users get a clear 400 immediately.
- Slack channels are additionally pinned to `https://hooks.slack.com/services/…`.

## Consequences

- Self-hosted services on private networks cannot be monitored; this is deliberate.
- Network egress rules on the host remain recommended as a second layer.
- Unit tests cover the block list and rebinding with a fake resolver; integration
  tests prove the API rejects internal URLs (`ssrf-guard.spec.ts`, `services.spec.ts`).
