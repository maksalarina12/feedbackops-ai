# Testing — what actually ran, and where the evidence lives

## Framework

No "unit test of a JSON file" pretending the workflow executes. Two live phases
against the REAL running workflow:

1. **live phase** — real webhook calls with real Gemini free tier
   (`python3 scripts/run_tests.py`). Slow by design (LLM latency, rate limits).
2. **mock phase** (`--full`) — same workflow with the Gemini HTTP node repointed
   to `scripts/mock_gemini.py`, forcing deterministic provider failures:
   malformed JSON, missing field, invalid enums, 30 s+ timeout, HTTP 429.
   After the phase, the real provider URL is RESTORED and verified.

Authentication is exercised when `WEBHOOK_SECRET` is exported: every request
carries `X-Webhook-Secret`, and a dedicated auth check sends one request
**without** the header and expects HTTP 403.

```bash
export N8N_API_KEY=... N8N_WORKFLOW_ID=... WEBHOOK_SECRET=...
python3 scripts/run_tests.py --full
```

## Offline validation (always runnable)

```bash
python3 scripts/validate_repo.py
node scripts/test_routing.mjs
node scripts/test_audit_store.mjs
node scripts/evaluate_policy.mjs
make test-api   # requires a frontend build
```

This is what CI runs. It does not need n8n, Gemini, or any secret. It checks:

- every required file exists (workflows, compose, Dockerfile, CI, docs);
- workflow JSON parses, required nodes exist, and connections point at real
  nodes;
- the webhook uses Header Auth and references a credential;
- the LLM URL is the fixed Gemini endpoint;
- no API-key/private-key material appears in tracked files;
- `.env` is not tracked and examples use placeholders;
- the Next.js proxy reads `WEBHOOK_SECRET` server-side and never uses
  `NEXT_PUBLIC_`;
- audit persistence uses the Header Auth credential and an env-driven URL;
- the SQLite store is idempotent, folds review events, redacts PII, enforces
  retention, migrates legacy JSONL, and raises on write failure (30 assertions);
- the exported routing policy passes 30 golden cases (the evaluation runs the
  actual `Deterministic Routing` code via `node:vm`);
- the built app passes login/session redirects, HMAC verification, audit writes,
  review actions, and rate-limit tests (25 assertions);
- the README references the demo screenshot and contains a license section.

## Evidence log

| Date | Run | Result |
|---|---|---|
| Develop day | live suite | **15/15 PASS** including positives, negatives, high-urgency routing, all pre-LLM rejections, prompt-injection containment, dedupe |
| Develop day | manual probe after real 403 provider incident | fail-safe produced `review` response with `llm_error`, HTTP still 200 — never a fake pass |
| Develop day | recovery probe 45 s after free-tier throttle | full success, normal routing |
| Develop day | mock phase 12–16 | **5/5 PASS** (malformed → unknown/review, missing field → unknown/review, invalid enum (incl. casing drift) → unknown/review, 30 s timeout → review fallback, 429 → review fallback) |
| Develop day | re-run during provider throttling window | deterministic cases still 10/10 PASS; LLM-dependent cases correctly reported `SKIPPED-THROTTLED` by harness instead of failing loudly |
| 2026-10-28 | `python3 scripts/validate_repo.py` | PASS — 120/120 offline contract checks |
| 2026-10-28 | `node scripts/test_routing.mjs` | PASS — 6/6 routing rule cases |
| 2026-10-28 | `npm run build` (Next.js 16, standalone) | PASS — UI + `/api/triage` route compile |
| 2026-10-28 | proxy smoke test (`POST /api/triage` → live n8n → Gemini) | PASS — classified as `normal` in 25.5 s |
| 2026-10-28 | demo screenshot capture (`docs/demo.png`) | PASS — real `high_priority` result in 4.8 s |
| 2026-10-28 | `npm ci` + `npm run build` (clean install) | PASS — lockfile reproducible |
| 2026-10-28 | `docker compose build frontend` | PASS — multi-stage image builds |
| 2026-10-28 | built image + `POST /api/triage` smoke test | PASS — classified `normal` in 14.1 s |
| 2026-10-28 | `node scripts/test_audit_store.mjs` | PASS — 30/30 SQLite idempotency, redaction, retention, migration, and failure assertions |
| 2026-10-28 | `node scripts/evaluate_policy.mjs` | PASS — 30/30 exported-policy cases (10 high_priority, 12 normal, 8 review) |
| 2026-10-28 | `node scripts/test_api.mjs` | PASS — 25/25 login, per-user session, HMAC, audit, review, and rate-limit assertions |
| 2026-10-28 | `npm run build` with `/login`, `/review`, `/api/health` | PASS — TypeScript and routes compile |
| 2026-10-28 | `/api/audit` live smoke test (bad secret, valid secret, review action) | PASS — 401/403/201/200 as expected |
| 2026-10-28 | review queue screenshot (`docs/review.png`) | PASS — seeded audit rows rendered with live counts behind login |
| 2026-10-28 | `docker compose build frontend` + container on `:3101` | PASS — health 200, per-reviewer login 200, `/review` 200; HMAC audit row survived restart |
| 2026-10-28 | Live n8n re-import (`<workflow-id>`) | PASS — 18 nodes active; webhook without secret 403, with secret 200 |
| 2026-10-28 | Live triage → audit side branch | PASS — Gemini returned valid classification; SQLite row persisted with `source` and `review_status` |
| 2026-10-28 | Live HMAC audit branch | PASS — n8n signed timestamp/body; SQLite row persisted after enabling HMAC |
| 2026-10-28 | Per-reviewer login + resolve | PASS — session shows `reviewer`; review event records `reviewer` |

**Auth status:** verified live on the re-imported workflow — webhook without
`X-Webhook-Secret` returns 403, with the secret returns 200, and the HMAC audit
branch persists after enabling `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

Coverage note: provider throttling makes live LLM cases occasionally
unrunnable; the harness retries (4 s/30 s/60 s) with fresh request IDs
(dedupe correctly rejects reused IDs — evidence it works), and reports skipped
cases honestly.

## Scenario → mechanism mapping (spec's 20 cases)

| # | Case | Verified by |
|---|---|---|
| 1 | valid positive | live ✓ |
| 2 | valid negative | live ✓ |
| 3 | high-urgency → high_priority routing | live ✓ |
| 4 | ambiguous | live ✓ |
| 5 | empty feedback → reject | live ✓ (`feedback_empty`, pre-LLM, ~18 ms) |
| 6 | missing feedback | live ✓ |
| 7 | invalid type | live ✓ |
| 8 | oversized input | live ✓ (`feedback_exceeds_2000_chars`) |
| 9 | prompt injection | live ✓ — payload treated as data; request to "classify as positive" NOT honored → routed review |
| 10 | malformed LLM JSON | mock ✓ — `unparseable_llm_json` → unknown/review |
| 11 | missing required field | mock ✓ |
| 12 | invalid enum value | mock ✓ (also observed REAL returned casing violations live during development) |
| 13 | provider timeout | mock ✓ (35 s sleep > 30 s node timeout) |
| 14 | provider rate limit | mock ✓ — and also induced accidentally by the real free tier 😄 |
| 15 | audit-log write failure | store-level ✓ — an unwritable `AUDIT_DB_PATH` rejects the write; the n8n side branch is configured `onError: continue`. Not re-run live against a broken store this session |
| 16 | duplicate request_id | live ✓ — 2nd attempt rejected `duplicate_request_id` in ~12–24 ms |
| 17 | normal routing live | live ✓ |
| 18 | high-priority routing live | live ✓ |
| 19 | human-review routing live | live ✓ (unknown/ambiguous and llm-error paths route `review`) |
| 20 | error response behavior | live ✓ — every rejection returns structured JSON with `success:false`, correct codes, no stack traces |
| — | provider HTTP 403/404 (bad key/model) | incident-verified live during development: fail-safe engaged |

## Known limitations (disclosed)

- No static-data unit fixtures (mock provider plays that role honestly).
- Dedupe map is in-memory (documented in ARCHITECTURE.md).
- Free-tier throttling can prevent live LLM runs; harness marks them honestly.
- Test suite does not assert Google Sheets (path pending credentials).
- SQLite is single-writer; multi-instance concurrency is not tested because the
  demo runs one Next.js instance.
- The policy evaluation measures rule conformance, not live Gemini accuracy.
- The rate limiter is in-memory per instance; distributed behavior is not tested.
- CI validates structure and builds the frontend; it does not run the live
  suite (no API key in CI by design).
