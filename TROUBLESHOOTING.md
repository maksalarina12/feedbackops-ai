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

**CORS errors in the browser console**
n8n handles the preflight natively; if you moved hosting, re-check the
OPTIONS request to the webhook. Keep the UI pointed at
`http://localhost:5678/webhook/feedbackops`.

**502 / cannot reach webhook**
The n8n container is down: `docker start n8n` then re-test with curl.

## Setup-specific gotchas (this laptop)

- `npm cache clean --force` first after a crashed install.
- If everything freezes at install time: add swap
  (see session logs; 8 GB RAM, no swap = micro-freezes under npm compile).
