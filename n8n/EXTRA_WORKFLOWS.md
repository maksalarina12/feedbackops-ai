# Extra workflows — escalation and weekly digest

Two optional workflows complement the main triage workflow:

| File | Trigger | Purpose |
|---|---|---|
| `escalation_workflow.json` | `POST /webhook/feedbackops-escalation` | Posts non-`normal` items to Slack |
| `weekly_digest_workflow.json` | Schedule (Monday 08:00) | Summarises the last 7 days of execution health |

Both are **templates**. Channel URLs and API keys live in the environment or in
n8n credentials, never in the exported JSON. The persistent audit branch lives
in the main workflow (`AUDIT_WEBHOOK_URL`), so it is not part of these files. They degrade gracefully: if Slack
is not configured, the escalation workflow still responds; if the escalation
workflow is down, the main triage response is unaffected.

## Credentials

Create these in n8n (Settings → Credentials → Header Auth):

| Credential | Header name | Value |
|---|---|---|
| `FeedbackOps Webhook Auth` | `X-Webhook-Secret` | same as `WEBHOOK_SECRET` |
| `n8n API (header auth)` | `X-N8N-API-KEY` | an n8n API key (Settings → n8n API) |

The escalation workflow reuses `FeedbackOps Webhook Auth`, which is also used by
the main workflow's `Notify Escalation` node.

## Environment

```bash
# .env
ESCALATION_WEBHOOK_URL=http://localhost:5678/webhook/feedbackops-escalation
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
N8N_BASE_URL=http://localhost:5678
```

- `ESCALATION_WEBHOOK_URL` enables the side branch in the main workflow.
- `SLACK_WEBHOOK_URL` enables Slack delivery in both extra workflows.
- `N8N_BASE_URL` is the API base used by the weekly digest.
- The workflows read these through `$env`, so n8n must run with
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (the default). In Docker Compose this is
  already set.

Restart n8n after changing environment variables.

## Build and import

```bash
python3 scripts/build_extra_workflows.py \
  <WEBHOOK_CRED_ID> "FeedbackOps Webhook Auth" \
  <N8N_API_CRED_ID> "n8n API (header auth)"

for f in n8n/escalation_workflow.json n8n/weekly_digest_workflow.json; do
  curl -s -X POST http://localhost:5678/api/v1/workflows \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d @"$f"
done
```

Activate both workflows in the n8n UI, then verify:

```bash
curl -s -X POST http://localhost:5678/webhook/feedbackops-escalation \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"request_id":"esc-1","routing_decision":"high_priority",
       "source":"manual","result":{"summary":"Double charge, urgent."}}'
```

Expected shape:

```json
{
  "success": true,
  "request_id": "esc-1",
  "route": "high_priority",
  "channel": "slack",
  "problems": []
}
```

`channel` is `none` when `SLACK_WEBHOOK_URL` is not set — the request is still
accepted and logged.

## Escalation payload contract

Sent by the main workflow's `Notify Escalation` node:

```json
{
  "request_id": "uuid",
  "routing_decision": "high_priority",
  "result": {
    "sentiment": "negative",
    "category": "billing",
    "urgency": "high",
    "summary": "..."
  },
  "source": "demo_ui",
  "received_at": "2026-10-28T..."
}
```

The workflow validates `request_id` and `routing_decision`, caps lengths, and
never trusts the payload. Slack text is built deterministically.

## Weekly digest

The digest fetches `GET /api/v1/executions?limit=250`, filters the last 7 days,
and reports total runs, success/failure/running counts, success rate, and average
duration. It does **not** summarise feedback content — that would require
querying the audit store, which the digest does not do today.

Limitations:

- The n8n API returns the 250 most recent executions; very busy instances need
  pagination or a database query.
- Slack delivery is skipped when `SLACK_WEBHOOK_URL` is empty.
- The schedule is fixed to `0 8 * * 1` (Monday 08:00) and uses the n8n
  instance timezone (`GENERIC_TIMEZONE`).
