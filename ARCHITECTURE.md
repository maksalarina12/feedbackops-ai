# FeedbackOps AI — Architecture

## Components

1. **n8n workflow** (Docker, self-hosted) — the orchestrator. Ten nodes.
2. **LLM adapter** (HTTP Request node) — Gemini today; the boundary
   (text in → schema-validated JSON out) is provider-agnostic. Swapping to
   Claude Messages API means replacing one node's URL/body while every other
   node stays untouched.
3. **Deterministic rule layer** (Code node) — routing decisions only.
4. **Google Sheets** — *pending credentials, documented*. The audit trail
   currently lands in n8n's own execution log via a `[AUDIT]` JSON line.
5. **Demo frontend** (Next.js 16, TS) — calls the LIVE webhook; no fake state.

## Request lifecycle

1. **Feedback Webhook** (`POST /webhook/feedbackops`, `responseMode=last-node`)
   accepts `{feedback, source?, request_id?}`. CORS preflight is handled by
   n8n's native webhook CORS (echoes allowed origin).
2. **Validate & Normalize** — single trust boundary:
   - body must be an object; `feedback` must be a trimmed non-empty string
     ≤ 2000 chars; optional `source`, `request_id` strings with length caps;
   - Generates a UUID `request_id` when absent;
   - Demo-grade dedupe: request IDs seen by prior executions are rejected with
     `duplicate_request_id` (in-memory static data, capped at 1000, lost on
     restart — NOT a production exactly-once guarantee).
   - Rejections return `success:false` with a machine-readable error code and
     **never reach the AI** (no tokens spent).
3. **Gemini Classify** — sends the feedback + structural prompt asking for
   strict-lowercase enums with a `responseSchema`; `temperature: 0`.
   - Prompt-injection hardening: the customer text is framed as DATA; feedback
     is JSON-stringified so it can never escape its quoting context.
   - Node has `onError: continue` + 30 s timeout, so provider failures flow
     into the validation node instead of crashing the run.
4. **Validate LLM Output** — second defense layer. The provider's own schema
   enforcement is NOT trusted (verified in testing: the real Gemini response
   violated its enum casing). This node re-parses and re-checks every field;
   any violation → `unknown` + review, never a fabricated pass.
5. **Deterministic Routing** (no LLM here):
   - `llm_error` → `review`
   - urgency high → `high_priority`
   - any `unknown` field → `review`
   - else → `normal`
6. **Build responses** — strict response schema: `success`, `request_id`,
   `result{...}`, `routing_decision`, `review_required`, `suggested_response`,
   `llm{...}`, `processing_duration_ms`, `error`.
7. **Audit Log (local)** — one `[AUDIT]` JSON line per execution
   (request_id, timestamp, source, classification, routing, review status,
   llm_error, duration). Google Sheets is the pending production target.
8. **Respond to Webhook** — CORS header, structured JSON.

## Trust boundaries

```
caller webhook ──▶ [VALIDATION: everything past here is trusted-shaped]
                     [AI: untrusted OUTPUT] ──▶ [RE-VALIDATION]
                                              ──▶ [RULES: trusted decisions]
```

- Input is data. The feedback text is JSON-encoded inside the prompt and the
  prompt forbids instruction-following from the payload.
- The model's output is untrusted until re-validated.
- Side effects (suggested replies) are drafts; `review_required` routes a human
  queue. The system never authorises refunds/compensation from model output.

## Error strategy

| Failure | Behavior |
|---|---|
| invalid input | reject pre-LLM with error code (18 ms in practice) |
| provider HTTP error / timeout | no retry loop (single-shot in demo); flows to validation → `review` |
| malformed JSON / missing field / bad enum | field → `unknown` + `llm_error` + `review` |
| duplicate request_id | reject with `duplicate_request_id` |
| audit destination failure | impossible in current fallback (console); disclosed |

## What is deliberately NOT here (1-day scope)

- No Python microservice: n8n Code nodes cover validation/routing; a second
  runtime would duplicate the single source of truth for rules.
- No queue/DB: audit uses execution log; Sheets/Postgres documented as next step.
- No persistence of requests: dedupe map is ephemeral and documented.
- No auth on the webhook beyond path-security & origin-echo CORS: hardcoded
  shared-secret is sketched in SECURITY.md but left OFF for demo traceability.
