# Troubleshooting — issues actually hit and fixed here

## n8n / workflow

**"Code doesn't return items properly"**
The first Code node ran with all JS newlines stripped (`text.const body = …`
on one line). Cause: piping workflow JSON through zsh `echo` into
`curl -d @-`. zsh's echo interprets `\n`; n8n then parses a body with raw
newlines inside JSON strings and mangles the value.
Fix: always `curl -d @file.json`.

**Webhook returns 404 "not registered"**
Add a few seconds after activation; production URLs register asynchronously
(and activation is required for `/webhook/...`; test URLs need an editor
session).

**Workflow refuses deletion via API (409)**
Deactivate first (`POST /workflows/{id}/deactivate`), wait a moment, then
`DELETE`. If it 404s, it was already gone.

**Public API rejects PUT with "meta is read-only"**
Strip `meta` (and any unsupported top-level fields) before PUT.

**Webhook returns 403 "Authorization data is wrong!"**
The `X-Webhook-Secret` header is missing or does not match the n8n Header Auth
credential. Check `WEBHOOK_SECRET` in `.env` and `frontend/.env.local`, and the
`FeedbackOps Webhook Auth` credential value. The browser never sends this header
itself — the Next.js proxy does.

**HTTP Request node calls Gemini without the credential header (403
"unregistered callers")**
The 4.x HTTP Request node needs BOTH:
```json
"authentication": "genericCredentialType",
"genericAuthType": "httpHeaderAuth"
```
plus a `credentials: { httpHeaderAuth: {...} }` block.

## Gemini free tier

**Intermittent `unparseable_llm_json` on ALL live cases**
Almost always rate-limiting — the error body has no candidates. Retry after
30–60 s. The workflow treats it as review-required by design; the harness
marks throttled cases `SKIPPED-THROTTLED`.

**Model ignoring enum casing / invented categories**
Real observed behavior (Gemini 3.x): returned `"Negative"` and
`"Damaged Product"` despite the responseSchema. That is why the downstream
validation node lowercases and re-checks — do not remove it.

## Frontend

**UI shows "Cannot reach the triage service"**
The browser calls same-origin `/api/triage`, so CORS is no longer involved. Check
that `frontend/.env.local` exists with `N8N_WEBHOOK_URL` and `WEBHOOK_SECRET`,
then restart `npm run dev`. The proxy returns 502 when n8n is unreachable.

**502 / cannot reach webhook**
The n8n container is down: `docker start n8n` then re-test with
`curl -H "X-Webhook-Secret: $WEBHOOK_SECRET" ...`.

**Escalation/digest posts are skipped**
`SLACK_WEBHOOK_URL` and `ESCALATION_WEBHOOK_URL` are read through `$env`, which
requires `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (the default). Restart n8n after
changing env vars, and confirm the escalation workflow is active.

**Review queue is empty**
Check, in order:
1. `AUDIT_WEBHOOK_URL` is set and n8n was restarted after changing it. Compose
   defaults to `http://frontend:3000/api/audit`; host-run n8n needs
   `http://localhost:3000/api/audit`.
2. The `Persist Audit` node ran successfully in the n8n execution view. A 403
   there means the `FeedbackOps Webhook Auth` value does not match
   `WEBHOOK_SECRET`; a 401 with HMAC enabled means the signature, timestamp, or
   raw body did not match.
3. The Next.js process can write the SQLite file at `AUDIT_DB_PATH` (default
   `.data/audit.sqlite`; `/app/.data` inside the container). On Linux, a
   host-owned `.data` directory can block the container's `nextjs` user.
4. You are signed in at `/login` as a username present in `REVIEW_USERS` (or with
   the legacy shared `REVIEW_PASSWORD`). A changed hash/password invalidates old
   cookies only after expiry or sign-out.
5. You are looking at the same instance that received the rows. `docker compose
   down -v` deletes the `frontend_data` volume.

**Review login loops or returns 401**
Set `REVIEW_USERS` (preferred) or the legacy `REVIEW_PASSWORD`, plus
`REVIEW_SESSION_SECRET`, and restart the frontend. `REVIEW_USERS` must be a
single-line JSON map of username -> `scrypt$<salt>$<hash>`; generate entries with
`node scripts/hash_review_password.mjs`. With Docker Compose, confirm they are in
`.env`; with a local process, put them in `frontend/.env.local`. Login is
rate-limited to 10 attempts/minute per IP, so repeated wrong passwords return
429 until the window expires.

**n8n HMAC branch fails in Code node**
Set `NODE_FUNCTION_ALLOW_BUILTIN=crypto` on the n8n container (Compose already
does). Without it the Code node cannot `require('crypto')` and throws
`crypto is not defined` or a require-resolver error. Restart n8n after changing
the variable.

**"Mark resolved" fails**
`/api/review` requires a valid session and rejects cross-origin requests. Open
the queue via `http://localhost:3000/review` (not an IDE preview proxy or a
different host), and check that the SQLite volume is writable. The button only
sends `resolved` or `needs_review`; other values are rejected.

## Setup-specific gotchas (this laptop)

- `npm cache clean --force` first after a crashed install.
- If everything freezes at install time: add swap
  (see session logs; 8 GB RAM, no swap = micro-freezes under npm compile).
