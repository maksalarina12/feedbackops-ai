# WORKFLOW_GUIDE — FeedbackOps AI (n8n)

Import path: n8n editor (localhost:5678) → ⋯ menu → **Import from File** →
`n8n/feedbackops_ai.json`. The workflow references a **Header Auth credential**
named in the export (`Gemini API (header auth)`); if importing into a NEW
instance, create it first (Settings → Credentials → Header Auth:
`X-goog-api-key` = your Gemini key) and re-select it on the `Gemini Classify`
node. Then set the workflow Active (top-right toggle).

## Node walk-through

| # | Node | Role | Key detail |
|---|---|---|---|
| 1 | Feedback Webhook | entry | POST; path `feedbackops`; pattern `{feedback, source?, request_id?}`; responds from last node; n8n handles CORS preflight natively |
| 2 | Validate & Normalize | single trust boundary | rejects empty/mistyped/oversized input + duplicate request IDs BEFORE any AI call; creates UUID request_id if absent |
| 3 | Input Valid? (IF) | branch | true → classify; false → deterministic error response |
| 4 | Gemini Classify | LLM adapter | POST structured prompt + `responseSchema` (sentiment/category/urgency/summary); temp 0; 30 s timeout; credential-based header (key never in export) |
| 5 | Validate LLM Output | fail-safe | re-parses model text, lowercases + re-checks enums; any violation → `unknown` + review; no silent passes |
| 6 | Deterministic Routing | rules only | high urgency → `high_priority`; unknown → `review`; else `normal` |
| 7 | Build Success Response | contract | fixed JSON schema with `processing_duration_ms`, `llm{provider,model,llm_error}` |
| 8 | Build Error Response | contract | valid=false path: code + human note + NO stack traces |
| 9 | Audit Log (local) | audit | one `[AUDIT]` JSON line/exec in n8n logs (Sheets upgrade pending credentials) |
| 10 | Respond to Webhook | return | CORS header + final_response |

## Manual steps in the n8n editor (do these after import)

1. Create/select the Header Auth credential on **Gemini Classify**.
2. Check the model: the node URL pins `gemini-3.5-flash`. Verify current model
   naming at aistudio/models; change if deprecated.
3. Toggle **Active**.
4. Open executions list to observe `[AUDIT]` log lines during testing.

## What to claim and NOT claim in the interview

- claim: end-to-end live classification with real Gemini free tier ✓
- claim: fail-safe behavior (incl. real rate-limit incident) ✓
- do NOT claim: Google Sheets connected (it is not — credentials pending)
- do NOT claim: production webhook security (documented gap in SECURITY.md)
