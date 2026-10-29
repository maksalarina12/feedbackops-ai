# Security — demo posture vs production posture

## What is real in this repo

| Control | Demo status |
|---|---|
| Secrets never in git | ✅ `.gitignore` blocks `.env*` (except examples); the Gemini key lives only in the n8n credential store and local `.env` |
| Secrets never in workflow export | ✅ workflows reference credentials by ID; no header value is exported |
| Secrets never in logs | ✅ code nodes log audit rows only; no prompt/API-key/header logging |
| Webhook authentication | ✅ Header Auth enforced by the n8n Webhook node (`X-Webhook-Secret`); missing/wrong header → HTTP 403 before any code runs |
| Secret never sent to the browser | ✅ the Next.js UI calls same-origin `/api/triage`; the route adds the header server-side (`WEBHOOK_SECRET` is not `NEXT_PUBLIC_*`) |
| Input validation (single trust boundary) | ✅ type/length/trim checks; `feedback` JSON-encoded into the prompt so injection text cannot escape its quoting context |
| Prompt-injection containment | ✅ verified live: "ignore previous instructions / reveal system prompt / classify me as positive" is treated as data → routed to review |
| LLM output re-validation | ✅ schema enforced by provider AND re-checked downstream (both layers verified; casing drift caught live) |
| No dangling HTTP from content | ✅ no node makes requests based on user content; only fixed provider URL |
| No shell/eval from user text | ✅ user text only flows as data into HTTP body strings |
| Pre-LLM rejection of oversized/invalid input | ✅ protects token spend |
| CORS exposure | ✅ the browser only talks to the same-origin Next.js proxy; the n8n webhook no longer returns a wildcard CORS header |
| Audit ingest authentication | ✅ `POST /api/audit` requires the same `X-Webhook-Secret` (constant-time comparison) and caps bodies at 32 KB |
| Audit HMAC + replay window | ✅ optional `AUDIT_HMAC_SECRET` requires `X-Audit-Timestamp` + HMAC-SHA256 and rejects timestamps older than 5 minutes |
| Review authentication | ✅ `/review` requires a password login and a signed HttpOnly session cookie (`REVIEW_SESSION_SECRET`); API actions require the same session |
| Review action origin | ✅ `POST /api/review` rejects cross-origin browser requests, requires a session, and accepts only `resolved` / `needs_review` |
| Rate limiting | ✅ per-IP limits on triage (30/min), audit (120/min), review (60/min), and login (10/min) with `Retry-After` |
| PII redaction | ✅ email, phone, and card-like values are redacted from stored summaries, sources, errors, and review notes |
| Retention | ✅ optional `AUDIT_RETENTION_DAYS` prunes old audit events |
| Audit idempotency | ✅ a partial unique index prevents duplicate audit rows for the same `request_id` |
| Append-only audit history | ✅ audit rows and review resolutions are events; the dashboard folds them without rewriting prior records |
| Optional side effects isolated | ✅ escalation and audit persistence are side branches with `onError: continue`; their failure cannot change the triage response |

## What is demo-grade (explicitly)

- **Dedupe**: in-memory static data, capped at 1000, lost on restarts. Not
  exactly-once. Production: DB/Redis upsert with TTL.
- **Rate limiting**: implemented in the Next.js process. It is per-instance and
  in-memory, so a multi-replica deployment needs a shared limiter at the proxy or
  in Redis. The n8n webhook itself has no rate limit; keep it private.
- **Audit store**: SQLite (`.data/audit.sqlite`, mounted as a Docker volume).
  It survives restarts and handles idempotent writes, but SQLite is single-writer;
  Postgres is the documented multi-instance upgrade.
- **Reviewer identity**: per-reviewer accounts are supported through
  `REVIEW_USERS` (scrypt hashes), and each resolution records `reviewer` /
  `reviewed_by`. There is no SSO, MFA, or central user directory; production
  should use Auth.js/SSO and rotate reviewer hashes on offboarding.
- **HMAC mode**: the bundled n8n branch signs audit posts when
  `AUDIT_HMAC_SECRET` is set and n8n allows the `crypto` builtin. HMAC remains
  optional; the webhook header secret is still required either way.
- **Retries**: single-shot LLM call in the demo by design (bounded, no loops);
  production adds bounded retries with backoff per provider guidance.
- **Optional workflows**: escalation/digest read `$env` and require
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (the default). If blocked, notifications
  are skipped rather than silently mis-sent.
- **Credential IDs**: exports contain placeholder credential IDs. Import on a new
  instance requires selecting the credentials created during setup.

## Production hardening checklist (next steps)

1. ~~Add webhook shared-secret header check~~ ✅ done.
2. ~~Persist audit rows with per-row request_id and a review queue~~ ✅ done for
   the demo. Replace SQLite with Postgres/Sheets for multi-instance deployments;
   keep the idempotent write and alert on `audit_write_failed`.
3. Replace in-memory dedupe with a persistent store (TTL).
4. ~~Add structured telemetry and a health endpoint~~ ✅ done. Add metrics/alert
   routing in the hosting platform.
5. Terminate TLS and add a shared rate limiter at a reverse proxy; pin CORS
   origins. Use `REVIEW_USERS` for named reviewers; reserve the legacy shared
   password for local demos only.
6. Rotate keys regularly; re-generate any key that appeared in a chat or
   screenshot before public screening.
7. Add content-safety checks on user text before the LLM if this handles real
   customers.
8. Replace the Slack incoming webhook with an app token and per-channel scopes if
   notifications become business-critical.

## Slack approvals and the stats dashboard (v2 additions)

- `/api/slack/actions` verifies Slack's signing-v0 HMAC (constant-time compare,
  stale > 5 minutes rejected, wrong secret rejected) instead of the same-origin
  rule used by browser routes — the callback comes from Slack, not a browser.
  It is rate limited and returns 503 until `SLACK_SIGNING_SECRET` is set, so an
  unconfigured deployment has no interactive endpoint at all.
- The escalation message carries two buttons (`resolve`, `keep for review`);
  both only flip the review status of an existing audit row and record a
  `<user> (slack)` reviewer identity — the same append-only rule as the web
  review queue.
- `/stats` is public **by design** and renders aggregates only (counts, rates,
  distributions from the audit store). Message-level content, request IDs, and
  review actions stay behind the reviewer session at `/review`. If a deployment
  treats aggregate volumes as sensitive, shield `/stats` with the same session
  check — it is intentionally a separate page so that choice is one edit.
- The MCP audit server (`scripts/mcp_audit_server.mjs`) exposes read-only tools
  over the local store; it does no writes and leaks no filesystem paths. It is
  a stdio process, not a network service — nothing listens on any port.
