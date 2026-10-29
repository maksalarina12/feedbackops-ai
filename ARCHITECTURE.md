# FeedbackOps AI — Architecture

Decision records: [`docs/adr/`](adr/) cover n8n orchestration, deterministic
routing, the audit side branch, and the SQLite demo store.

## Components

1. **Next.js proxy** (`POST /api/triage`) — same-origin entry point for the UI.
   Adds `X-Webhook-Secret` server-side, caps body size, and applies a 45 s
   timeout. The secret never reaches the browser.
2. **n8n triage workflow** (Docker, self-hosted) — the orchestrator. Eighteen
   nodes, including the optional escalation and audit-persistence side branches.
3. **LLM adapter** (HTTP Request node) — Gemini today; the boundary
   (text in → schema-validated JSON out) is provider-agnostic. Swapping to the
   Claude Messages API means replacing one node's URL/body while every other
   node stays untouched.
4. **Deterministic rule layer** (Code node) — routing decisions only.
5. **Escalation workflow** (optional) — receives non-`normal` items and posts to
   Slack when `SLACK_WEBHOOK_URL` is configured.
6. **Weekly digest workflow** (optional) — scheduled aggregation of n8n
   execution health for the last 7 days.
7. **Audit store + review queue** — SQLite (`node:sqlite`) written through
   `POST /api/audit`; `/review` renders the queue and `POST /api/review` appends
   resolution events. Audit writes are idempotent per `request_id`, PII is
   redacted, and retention is optional. Reviewer access uses a password plus a
   signed HttpOnly cookie.
8. **Google Sheets** — *pending credentials, documented* as a production
   destination alongside a real database.
9. **Demo frontend** (Next.js 16, TS) — calls the live proxy; no fake state.

## Request lifecycle

1. **Browser** posts to `/api/triage`. The proxy adds `X-Webhook-Secret` and
   forwards to **Feedback Webhook** (`POST /webhook/feedbackops`).
2. **Webhook authentication** — n8n's Header Auth credential validates the
   secret. Missing or wrong values return HTTP 403 before any workflow code runs.
3. **Validate & Normalize** — single trust boundary:
   - body must be an object; `feedback` must be a trimmed non-empty string
     ≤ 2000 chars; optional `source`, `request_id` strings with length caps;
   - generates a UUID `request_id` when absent;
   - demo-grade dedupe: request IDs seen by prior executions are rejected with
     `duplicate_request_id` (in-memory static data, capped at 1000, lost on
     restart — NOT a production exactly-once guarantee);
   - rejections return `success:false` with a machine-readable error code and
     **never reach the AI** (no tokens spent).
4. **Gemini Classify** — sends the feedback + structural prompt asking for
   strict-lowercase enums with a `responseSchema`; `temperature: 0`.
   - Prompt-injection hardening: the customer text is framed as DATA; feedback
     is JSON-stringified so it can never escape its quoting context.
   - Node has `onError: continue` + 30 s timeout, so provider failures flow
     into the validation node instead of crashing the run.
5. **Validate LLM Output** — second defense layer. The provider's own schema
   enforcement is NOT trusted (verified in testing: the real Gemini response
   violated its enum casing). This node re-parses and re-checks every field;
   any violation → `unknown` + review, never a fabricated pass.
6. **Deterministic Routing** (no LLM here):
   - `llm_error` → `review`
   - urgency high → `high_priority`
   - any `unknown` field → `review`
   - else → `normal`
7. **Build response** — strict response schema: `success`, `request_id`,
   `result{...}`, `routing_decision`, `review_required`, `suggested_response`,
   `llm{...}`, `processing_duration_ms`, `error`.
8. **Audit Log (local)** — builds one structured audit row per execution
   (request_id, timestamp, source, classification, routing, review status,
   llm_error, duration) and logs it via `[AUDIT]`.
9. **Persist Audit** (side branch) — enabled only when `AUDIT_WEBHOOK_URL` is
   set. POSTs the row to `/api/audit` with the shared secret plus optional HMAC
   timestamp/signature; the HTTP node uses `onError: continue`, so a store outage never
   changes the response. The endpoint rate-limits, redacts PII, and ignores
   duplicate `request_id` writes.
10. **Respond to Webhook** — structured JSON. No wildcard CORS header; the
    browser talks only to the same-origin proxy.
11. **Review queue** — `/review` folds the audit stream plus resolution events
   into the current state. Marking an item resolved appends an event; existing
   rows are never rewritten.
12. **Prepare Escalation** (side branch) — enabled only when
    `ESCALATION_WEBHOOK_URL` is set and the route is not `normal`. The HTTP
    hand-off has `onError: continue`, so a notification failure can never change
    the triage outcome.

## Trust boundaries

```
browser ──▶ [NEXT PROXY: adds secret] ──▶ [WEBHOOK AUTH: 403 on failure]
                                           │
                                           ▼
                         [VALIDATION: everything past here is trusted-shaped]
                         [AI: untrusted OUTPUT] ──▶ [RE-VALIDATION]
                                                  ──▶ [RULES: trusted decisions]
                                                  ──▶ [SIDE BRANCH: optional, isolated]
```

- Input is data. The feedback text is JSON-encoded inside the prompt and the
  prompt forbids instruction-following from the payload.
- The model's output is untrusted until re-validated.
- Side effects (suggested replies) are drafts; `review_required` routes a human
  queue. The system never authorises refunds/compensation from model output.
- The shared secret is server-side only and never logged. `/api/audit` checks
  the same secret (and optional HMAC), while `/api/review` requires a signed
  reviewer session (carrying the username) and a same-origin request. Review
  events record the acting reviewer.
- Stored audit fields pass through email/phone/card redaction; review notes are
  redacted too.

## Error strategy

| Failure | Behavior |
|---|---|
| missing/wrong webhook secret | HTTP 403 before any code runs |
| invalid input | reject pre-LLM with error code (18 ms in practice) |
| provider HTTP error / timeout | no retry loop (single-shot in demo); flows to validation → `review` |
| malformed JSON / missing field / bad enum | field → `unknown` + `llm_error` + `review` |
| duplicate request_id | reject with `duplicate_request_id` |
| audit destination failure | logged with `audit_write_failed`, isolated; triage response is unaffected |
| audit auth/HMAC failure | HTTP 401/403, no write; the caller still gets its triage response |
| rate limit exceeded | HTTP 429 with `Retry-After`; no work is queued |
| reviewer session invalid/expired | `/review` redirects to `/login`; `/api/review` returns 401 |
| escalation/Slack failure | logged, isolated; triage response is unaffected |

## What is deliberately NOT here (1-day scope)

- No Python microservice: n8n Code nodes cover validation/routing; a second
  runtime would duplicate the single source of truth for rules.
- No production database: the audit store is single-node SQLite; Postgres is the
  documented next step. The rate limiter is also per-instance and in-memory.
- No durable dedupe: the dedupe map is ephemeral and documented.
- No built-in rate limiting: put n8n behind a reverse proxy for real traffic.
