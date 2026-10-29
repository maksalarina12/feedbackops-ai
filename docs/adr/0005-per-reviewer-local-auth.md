# ADR 0005 — Per-reviewer local accounts for the demo queue

## Context
The review queue needs attributable actions ("who resolved this?") without
requiring an external identity provider in every demo environment. A single
shared password is simple, but it cannot support that claim.

## Decision
Accept `REVIEW_USERS`, a JSON map of username to a salted scrypt hash
(`scrypt$<saltHex>$<hashHex>`). A successful login creates a signed, HttpOnly
session cookie carrying the username; `/api/review` records it on the append-only
review event and the queue renders `reviewed_by`. The legacy `REVIEW_PASSWORD`
fallback remains for local demos only and is disabled when `REVIEW_USERS` is set.
An invalid `REVIEW_USERS` value fails closed rather than falling back.

## Consequences
- Reviewer attribution works with no database or external service.
- Accounts are managed by editing an environment variable; there is no password
  reset, MFA, SSO, or centralized offboarding. Rotate hashes when access changes.
- Production should replace this layer with an identity provider (for example
  Auth.js or SSO) while keeping the same session/review-event contract.
