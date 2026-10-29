# Setup — Ubuntu (zsh)

Every command below was verified on Ubuntu 26.04 LTS, zsh, Docker 29.x,
Python 3.13, Node 24, n8n 2.45.4.

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

> Prefer Compose? Run `docker compose up -d` from the repository root instead of
> this command. Continue with step 2 either way.

## 2. Generate secrets and an n8n API key

Create the shared webhook secret and put it in `.env`:

```bash
cp -n .env.example .env
export WEBHOOK_SECRET="$(openssl rand -hex 16)"
export REVIEW_PASSWORD="$(openssl rand -base64 24)"
export REVIEW_SESSION_SECRET="$(openssl rand -hex 32)"
python3 - "$WEBHOOK_SECRET" "$REVIEW_PASSWORD" "$REVIEW_SESSION_SECRET" <<'PY'
import hashlib, json, pathlib, secrets, sys
path = pathlib.Path(".env")
salt = secrets.token_bytes(16)
digest = hashlib.scrypt(
    sys.argv[2].encode(), salt=salt, n=16384, r=8, p=1, dklen=64
)
review_users = json.dumps(
    {"reviewer": f"scrypt${salt.hex()}${digest.hex()}"}, separators=(",", ":")
)
values = {
    "WEBHOOK_SECRET": sys.argv[1],
    "REVIEW_PASSWORD": sys.argv[2],
    "REVIEW_SESSION_SECRET": sys.argv[3],
    "REVIEW_USERS": "'" + review_users + "'",
    "REVIEW_USERNAME": "reviewer",
}
lines = [
    l for l in path.read_text().splitlines()
    if not any(l.startswith(key + "=") for key in values)
]
lines.extend(f"{key}={value}" for key, value in values.items())
path.write_text("\n".join(lines) + "\n")
PY
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"
echo "Reviewer: reviewer / $REVIEW_PASSWORD"
```

Fill `GEMINI_API_KEY` in `.env` as well. Optional: set `AUDIT_HMAC_SECRET` to
sign n8n audit posts; Compose already allows the `crypto` builtin.

In the n8n editor: **account menu (bottom-left) → Settings → n8n API → Create an
API key**. Export it for the scripts:

```bash
export N8N_API_KEY="paste-key-here"
```

## 3. Create the two Header Auth credentials

Both credentials live in n8n's credential store; neither value is written to the
repository.

### Gemini credential

```bash
curl -s -X POST http://localhost:5678/api/v1/credentials \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Gemini API (header auth)","type":"httpHeaderAuth",
       "data":{"name":"X-goog-api-key","value":"GEMINI_KEY_HERE"}}'
# → note the returned "id"
```

Or via UI: Settings → Credentials → Header Auth → name `X-goog-api-key`,
value = your Gemini key (free tier: https://aistudio.google.com).

### Webhook credential

Create a Header Auth credential named `X-Webhook-Secret` whose value is the same
`WEBHOOK_SECRET` from `.env`:

```bash
curl -s -X POST http://localhost:5678/api/v1/credentials \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"FeedbackOps Webhook Auth\",\"type\":\"httpHeaderAuth\",
       \"data\":{\"name\":\"X-Webhook-Secret\",\"value\":\"$WEBHOOK_SECRET\"}}"
# → note the returned "id"
```

Export both credential IDs:

```bash
export GEMINI_CRED_ID="...from step 3a..."
export WEBHOOK_CRED_ID="...from step 3b..."
```

## 4. Build, import, and activate the main workflow

```bash
python3 scripts/build_workflow.py \
  "$GEMINI_CRED_ID" "Gemini API (header auth)" \
  "$WEBHOOK_CRED_ID" "FeedbackOps Webhook Auth"

curl -s -X POST http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @n8n/feedbackops_ai.json
# → note the returned workflow id
```

Activate it:

```bash
export N8N_WORKFLOW_ID="<id-from-import>"
curl -s -X POST "http://localhost:5678/api/v1/workflows/$N8N_WORKFLOW_ID/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

## 5. (Optional) escalation and weekly digest

The escalation workflow reuses the webhook credential. The digest workflow needs
an n8n API Header Auth credential (`X-N8N-API-KEY` = your API key).

```bash
# create the API credential first (n8n UI or API), then:
python3 scripts/build_extra_workflows.py \
  "$WEBHOOK_CRED_ID" "FeedbackOps Webhook Auth" \
  "<N8N_API_CRED_ID>" "n8n API (header auth)"

for f in n8n/escalation_workflow.json n8n/weekly_digest_workflow.json; do
  curl -s -X POST http://localhost:5678/api/v1/workflows \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d @"$f"
done
```

Activate both workflows from the n8n UI, then set in `.env`:

```bash
ESCALATION_WEBHOOK_URL=http://localhost:5678/webhook/feedbackops-escalation
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_SIGNING_SECRET=<from the Slack app Basic Information page>
N8N_BASE_URL=http://localhost:5678
```

`SLACK_SIGNING_SECRET` enables the approve buttons in the escalation message:
their callback hits the frontend at `/api/slack/actions` and is verified with
Slack's signing-v0 HMAC. In your Slack app settings, set the interactive
"Request URL" to `https://<your-demo-domain>/api/slack/actions`.

Restart n8n after changing environment variables. With plain `docker run`, pass
these variables using `-e` (the container does not read `.env`); with Docker
Compose they are already wired from `.env`. Details:
[`n8n/EXTRA_WORKFLOWS.md`](n8n/EXTRA_WORKFLOWS.md).

The main workflow also has an **audit persistence** side branch. It is enabled
when `AUDIT_WEBHOOK_URL` is set and reuses the webhook Header Auth credential:

```bash
# n8n on the host or Docker with host networking:
AUDIT_WEBHOOK_URL=http://localhost:3000/api/audit
# Docker Compose: leave empty to use http://frontend:3000/api/audit
```

With plain `docker run`, also pass
`-e N8N_BLOCK_ENV_ACCESS_IN_NODE=false -e AUDIT_WEBHOOK_URL=...`. Rows are
written to the `frontend_data` Docker volume as SQLite
(`/app/.data/audit.sqlite`), or `frontend/.data/audit.sqlite` when running
locally. They appear at http://localhost:3000/review after reviewer login.

## 6. Smoke test

```bash
curl -s -X POST http://localhost:5678/webhook/feedbackops \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"feedback":"great service today","source":"setup","request_id":"setup-1"}'
```

Expected: `{"success":true,...}`. A request **without** the header must return
HTTP 403.

(The free tier may briefly rate-limit; the response is then
`routing_decision:"review"` with an `llm_error` — that is the designed fail-safe,
not a crash.)

## 7. Frontend

```bash
cp frontend/.env.local.example frontend/.env.local
# set N8N_WEBHOOK_URL, WEBHOOK_SECRET, REVIEW_USERS,
# and REVIEW_SESSION_SECRET to match .env

cd frontend
npm install
npm run dev     # http://localhost:3000
```

The browser calls `/api/triage`; the secret is added server-side. If you use
Docker Compose, `WEBHOOK_SECRET` is injected through the compose environment
instead. `/api/audit` uses the same secret, so `frontend/.env.local` must contain
`WEBHOOK_SECRET` for n8n to persist audit rows. Open `/review`, sign in with
username `reviewer` and the generated password, then resolve an item.
Generate additional reviewers with
`printf '%s' 'password' | node scripts/hash_review_password.mjs` and add each
hash to the `REVIEW_USERS` JSON.

The audit store is SQLite (`AUDIT_DB_PATH`, default
`frontend/.data/audit.sqlite`). It is a single-instance demo store, not a
production database. Seed representative rows with `make seed` (after the
frontend is running and `.env` has the secrets).

## 8. Test suite

```bash
export N8N_API_KEY N8N_WORKFLOW_ID WEBHOOK_SECRET
python3 scripts/run_tests.py --full
```

## 9. Offline validation

```bash
python3 scripts/validate_repo.py
```
