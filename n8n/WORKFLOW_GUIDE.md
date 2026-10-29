# WORKFLOW_GUIDE — FeedbackOps AI (n8n)

Import path: n8n editor (localhost:5678) → ⋯ menu → **Import from File** →
`n8n/feedbackops_ai.json`. The export references **two Header Auth
credentials** by name:

- `Gemini API (header auth)` — header `X-goog-api-key` = your Gemini key.
- `FeedbackOps Webhook Auth` — header `X-Webhook-Secret` = `WEBHOOK_SECRET`.

Create both first (Settings → Credentials → Header Auth), then re-select them on
the `Feedback Webhook` and `Gemini Classify` nodes if n8n does not match them
automatically. Toggle the workflow **Active**.

For a reproducible build with your own credential IDs:

```bash
python3 scripts/build_workflow.py \
  <GEMINI_CRED_ID> "Gemini API (header auth)" \
  <WEBHOOK_CRED_ID> "FeedbackOps Webhook Auth"
```

## Node walk-through

| # | Node | Role | Key detail |
|---|---|---|---|
| 1 | Feedback Webhook | entry | POST; path `feedbackops`; pattern `{feedback, source?, request_id?}`; **Header Auth required** (`X-Webhook-Secret`) |
| 2 | Validate & Normalize | single trust boundary | rejects empty/mistyped/oversized input + duplicate request IDs BEFORE any AI call; creates UUID request_id if absent |
| 3 | Input Valid? (IF) | branch | true → classify; false → deterministic error response |
| 4 | Gemini Classify | LLM adapter | POST structured prompt + `responseSchema` (sentiment/category/urgency/summary); temp 0; 30 s timeout; credential-based header (key never in export) |
| 5 | Validate LLM Output | fail-safe | re-parses model text, lowercases + re-checks enums; any violation → `unknown` + review; no silent passes |
| 6 | Deterministic Routing | rules only | high urgency → `high_priority`; unknown → `review`; else `normal` |
| 7 | Build Success Response | contract | fixed JSON schema with `processing_duration_ms`, `llm{provider,model,llm_error}` |
| 8 | Build Error Response | contract | valid=false path: code + human note + NO stack traces |
| 9 | Audit Log (local) | audit | builds one structured audit row/exec and logs it via `[AUDIT]` |
| 10 | Respond to Webhook | return | final JSON response; no wildcard CORS (browser uses the Next.js proxy) |
| 11 | Prepare Escalation | side branch | reads `ESCALATION_WEBHOOK_URL`; enabled only for non-`normal` routes |
| 12 | Escalation Needed? (IF) | branch | true → notify; false → branch ends |
| 13 | Notify Escalation | hand-off | POST to the escalation workflow with the same Header Auth credential; `onError: continue` |
| 14 | Escalation Done | sink | keeps the side branch isolated from the response path |
| 15 | Prepare Audit Persist | side branch | reads `AUDIT_WEBHOOK_URL`; enabled only when the URL and an audit row exist |
| 16 | Audit Persist Enabled? (IF) | branch | true → persist; false → branch ends |
| 17 | Persist Audit | hand-off | POSTs `audit_row` to `/api/audit` with the same Header Auth credential; `onError: continue`; the endpoint is idempotent per `request_id` and redacts PII |
| 18 | Audit Persisted | sink | keeps audit persistence off the response path |

The escalation and audit-persistence branches are optional. Without
`ESCALATION_WEBHOOK_URL` / `AUDIT_WEBHOOK_URL` they are skipped and the triage
response is unchanged. Persisted rows appear in the Next.js `/review` queue
after reviewer login. The branch sends the shared secret and, when
`AUDIT_HMAC_SECRET` is set, also `X-Audit-Timestamp` / `X-Audit-Signature`
(HMAC-SHA256 of `"<timestamp>.<raw body>"`). HMAC signing requires
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` on the n8n container.

## Manual steps in the n8n editor (after import)

1. Create/select the Header Auth credentials on **Feedback Webhook** and
   **Gemini Classify**.
2. Check the model: the node URL pins `gemini-3.5-flash`. Verify current model
   naming in AI Studio; change if deprecated.
3. Toggle **Active**.
4. Open the executions list to observe `[AUDIT]` log lines during testing.
5. Optional: import and activate `escalation_workflow.json` and
   `weekly_digest_workflow.json` — see
   [`EXTRA_WORKFLOWS.md`](EXTRA_WORKFLOWS.md).

## What to claim and NOT claim in the interview

- claim: end-to-end live classification with real Gemini free tier ✓
- claim: fail-safe behavior (incl. real rate-limit incident) ✓
- claim: shared-secret webhook auth + server-side proxy ✓
- claim: SQLite audit trail + per-reviewer authenticated review queue with append-only actions ✓
- claim: per-IP rate limits on triage/audit/review/login ✓
- do NOT claim: Google Sheets connected (it is not — credentials pending)
- do NOT claim: distributed rate limiting, persistent dedupe, SSO/MFA, or a
  multi-instance production database (see [`../SECURITY.md`](../SECURITY.md))
