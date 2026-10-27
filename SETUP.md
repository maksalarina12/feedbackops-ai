# Setup — Ubuntu (zsh)

Every command below was executed on Ubuntu 26.04 LTS, zsh, Docker 29.x.

## Prerequisites verified

- Python 3.13 / Node 24 / npm 11
- Docker running (`docker ps` shows the `n8n` container)
- n8n 2.45.4 reachable at http://localhost:5678 (HTTP 200)

## 1. n8n via Docker

```bash
docker run -d --name n8n -p 5678:5678 \
  --restart unless-stopped \
  -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

First open of http://localhost:5678 asks to create the owner account.

## 2. Generate an n8n API key

In the n8n editor: **account menu (bottom-left) → Settings → n8n API →
Create an API key**. Copy it. Export it for scripts:

```bash
export N8N_API_KEY="paste-key-here"
```

## 3. Create the Gemini credential

Two options — this repo supports API-driven setup:

```bash
export N8N_WORKFLOW_ID=$(python3 scripts/build_workflow.py --help >/dev/null && echo "")
# 1) create credential via n8n API (name + header value):
curl -X POST http://localhost:5678/api/v1/credentials \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Gemini API (header auth)","type":"httpHeaderAuth",
       "data":{"name":"X-goog-api-key","value":"GEMINI_KEY_HERE"}}'
#   → note the returned "id" and use it in the next step.
```

Or via UI: Settings → Credentials → Header Auth → name `X-goog-api-key`,
value = your Gemini key (free tier: https://aistudio.google.com).

## 4. Build & push the workflow

```bash
python3 scripts/build_workflow.py <CREDENTIAL_ID> "Gemini API (header auth)"
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  -d @n8n/feedbackops_ai.json
# then, using the returned workflow id:
curl -X POST http://localhost:5678/api/v1/workflows/<WF_ID>/activate \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

(The instance used during develop used workflow id `aNiPmw7yssdzg29B`;
export yours: `export N8N_WORKFLOW_ID=<id>`.)

## 5. Smoke test

```bash
curl -X POST http://localhost:5678/webhook/feedbackops \
  -H "Content-Type: application/json" \
  -d "{\"feedback\":\"great service today\",\"source\":\"setup\",\"request_id\":\"setup-$(date +%s)\"}"
```

Expected: `{"success":true,...}` with classification fields. (Free tier may
briefly rate-limit; response then is `routing_decision:"review"` with an
`llm_error` — that is the designed fail-safe, not a crash.)

## 6. Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

## 7. Environment file (optional)

`.env.example` documents the variables the design expects. Secrets are loaded
from it for local tooling only and are **never committed** (`.gitignore`).

## Notes learned on this exact machine

- DO NOT `echo` a workflow JSON into a curl `-d @-` pipe from zsh; zsh's echo
  mangles `\n` escapes and n8n saves the JS Code as one broken line. Always
  POST the file directly (`-d @file.json`).
- n8n's public API rejects `meta` circles in PUT bodies ("read-only").
- Gemini free tier throttles after bursts: retry after 30–60 s.
