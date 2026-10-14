# ADR 0003: Short-lived access token in memory, refresh token in an HttpOnly cookie; organization scoping in a guard

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

The spec forbids keeping high-privilege tokens in `localStorage` and requires every
request to check both membership and role (§11.1–11.2). The web app and API run on
different origins in development.

## Decision

- Login returns a 15-minute JWT access token in the response body; the web app keeps
  it in memory only. The 7-day refresh token is set as an `HttpOnly`, `SameSite=Lax`
  cookie scoped to `/api/v1/auth` (and `Secure` in production). Reloading the page
  restores the session through `POST /auth/refresh`.
- The JWT strategy trusts the verified claims (no user lookup per request).
  `OrgGuard` then loads the caller's membership — from the `:orgId` route parameter
  when present — and attaches the organization and current role. Every service query
  filters by that organization; resources outside it return 404, not 403, so IDs from
  other tenants cannot be probed.
- Role rules live next to the use case (viewers cannot mutate; only owners/admins
  manage members, integrations and channels; only owners grant OWNER; the last owner
  cannot be removed).
- Login attempts are rate-limited per (IP, email); everything else per IP.

## Consequences

- A stolen access token is useful for at most 15 minutes; refresh tokens are not
  readable by JavaScript.
- Role changes take effect on the next request because the role is read from the
  database by `OrgGuard`, not from the token.
- Refresh tokens are stateless and cannot be revoked server-side before expiry; a
  token store would be needed for "sign out everywhere".
- `SameSite=Lax` plus a path-scoped cookie limits CSRF to the refresh endpoint, which
  only returns a token to same-site callers.
