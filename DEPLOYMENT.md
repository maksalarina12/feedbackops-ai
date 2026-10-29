# Deployment — from local demo to a public demo

The intended public setup is a **single VPS running Docker Compose behind a TLS
reverse proxy**. The frontend talks to n8n over the private Compose network; only
the frontend is exposed to the internet. Vercel-only hosting is not recommended
for this version because the audit store is SQLite.

## 1. Prepare the host

- Ubuntu LTS, Docker Engine + Compose plugin, a non-root deploy user.
- DNS `A`/`AAAA` record for the demo hostname.
- Firewall: allow 22, 80, 443; do not expose 5678 or 3000 publicly.

## 2. Configure secrets

Copy `.env.example` to `.env` on the server and set at least:

```bash
WEBHOOK_SECRET=$(openssl rand -hex 32)
REVIEW_SESSION_SECRET=$(openssl rand -hex 32)
GEMINI_API_KEY=...
AUDIT_RETENTION_DAYS=30

# Preferred: username -> scrypt hash (repeat for each reviewer)
read -rsp "Reviewer password: " REVIEW_PASSWORD; echo
REVIEW_HASH=$(printf '%s' "$REVIEW_PASSWORD" | node scripts/hash_review_password.mjs)
REVIEW_USERS="{\"reviewer\":\"$REVIEW_HASH\"}"
```

`REVIEW_USERS` provides per-reviewer identities; `REVIEW_SESSION_SECRET` signs
the HttpOnly session cookie. Do not reuse either value. The legacy
`REVIEW_PASSWORD` path is only for backwards compatibility.

Optional hardening: set `AUDIT_HMAC_SECRET` and send `X-Audit-Timestamp` plus
`X-Audit-Signature` (HMAC-SHA256 of `"<timestamp>.<raw body>"`) from a trusted
sender. Compose already sets `NODE_FUNCTION_ALLOW_BUILTIN=crypto` so the n8n
Code node can sign the request; the bundled workflow does this automatically
when `AUDIT_HMAC_SECRET` is present.

## 3. Start the stack

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:3000/api/health
```

Seed demo rows only if this is a demo instance:

```bash
set -a; . ./.env; set +a
BASE_URL=http://localhost:3000 python3 scripts/seed_demo.py
```

## 4. TLS and reverse proxy

Install Caddy and use [`deploy/Caddyfile`](deploy/Caddyfile) as a starting point.
Change the hostname, then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Keep n8n private. Reach its editor through an SSH tunnel:

```bash
ssh -L 5678:localhost:5678 deploy@your-host
```

Then open `http://localhost:5678` locally. In `docker-compose.yml`, bind n8n to
loopback in production (`127.0.0.1:5678:5678`) instead of `5678:5678`.

## 5. Backups

- **Audit store**: back up the `frontend_data` volume (SQLite file plus WAL).
- **n8n**: back up the `n8n_data` volume and export workflows as JSON.
- Test restore, not just backup. A SQLite backup should use
  `sqlite3 audit.sqlite ".backup '/backup/audit.sqlite'"` or stop writes first.

## 6. Operational checklist

- [ ] TLS certificate valid; HTTP redirects to HTTPS.
- [ ] `GET /api/health` returns `ok: true`.
- [ ] `/review` redirects to `/login`; wrong password returns 401.
- [ ] `AUDIT_RETENTION_DAYS` set and a prune run verified.
- [ ] n8n API/editor not publicly reachable.
- [ ] Webhook secret rotated from any value used during development.
- [ ] Alerts on `audit_write_failed` and repeated `review_login_failed` logs.
- [ ] Backups scheduled and restore tested.

## What still needs external accounts

A real public demo needs a host, DNS, a Gemini key, and an n8n instance. Those
steps cannot be completed from the repository alone. The repository includes the
Compose stack, CI, health checks, and this runbook so the remaining work is
mechanical.
