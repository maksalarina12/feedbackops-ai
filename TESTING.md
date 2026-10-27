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

Run:

```bash
export N8N_API_KEY=... N8N_WORKFLOW_ID=...
python3 scripts/run_tests.py --full
```

## Evidence log (executed on this repo, same instance)

| Date | Run | Result |
|---|---|---|
| Develop day | live suite | **15/15 PASS** including positives, negatives, high-urgency routing, all pre-LLM rejections, prompt-injection containment, dedupe |
| Develop day | manual probe after real 403 provider incident | fail-safe produced `review` response with `llm_error`, HTTP still 200 — never a fake pass |
| Develop day | recovery probe 45 s after free-tier throttle | full success, normal routing |
| Develop day | mock phase 12–16 | **5/5 PASS** (malformed → unknown/review, missing field → unknown/review, invalid enum (incl. casing drift) → unknown/review, 30 s timeout → review fallback, 429 → review fallback) |
| Develop day | re-run during provider throttling window | deterministic cases still 10/10 PASS; LLM-dependent cases correctly reported `SKIPPED-THROTTLED` by harness instead of failing loudly |

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
| 15 | audit-log write failure | **NOT executable** — audit destination is `console.log`, which cannot fail; disclosed. In the Sheets path this becomes a real test |
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
