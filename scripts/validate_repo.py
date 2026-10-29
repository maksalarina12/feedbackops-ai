#!/usr/bin/env python3
"""Offline repository checks used by CI.

Validates workflow exports, security invariants, and documentation presence
without requiring a running n8n instance or any API key.

Usage: python3 scripts/validate_repo.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FAILURES = []
PASSES = []

SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]

REQUIRED_FILES = [
    "README.md",
    "LICENSE",
    "SETUP.md",
    "ARCHITECTURE.md",
    "SECURITY.md",
    "TESTING.md",
    ".env.example",
    "docker-compose.yml",
    "frontend/Dockerfile",
    "frontend/app/api/triage/route.ts",
    "frontend/app/api/audit/route.ts",
    "frontend/app/api/review/route.ts",
    "frontend/app/api/health/route.ts",
    "frontend/app/api/auth/login/route.ts",
    "frontend/app/api/auth/logout/route.ts",
    "frontend/app/api/slack/actions/route.ts",
    "frontend/app/stats/page.tsx",
    "frontend/lib/slack-signature.ts",
    "frontend/app/login/page.tsx",
    "frontend/app/review/page.tsx",
    "frontend/app/review/LogoutButton.tsx",
    "frontend/lib/audit-store.mjs",
    "frontend/lib/audit-store.d.mts",
    "frontend/lib/review-auth.ts",
    "frontend/lib/request-auth.ts",
    "frontend/lib/rate-limit.ts",
    "frontend/lib/logger.ts",
    "n8n/feedbackops_ai.json",
    "n8n/escalation_workflow.json",
    "n8n/weekly_digest_workflow.json",
    ".github/workflows/ci.yml",
    "scripts/validate_repo.py",
    "scripts/test_routing.mjs",
    "scripts/test_audit_store.mjs",
    "scripts/test_api.mjs",
    "scripts/test_slack_actions.mjs",
    "scripts/test_mcp_server.mjs",
    "scripts/mcp_audit_server.mjs",
    "samples/knowledge_base.json",
    "scripts/evaluate_policy.mjs",
    "scripts/seed_demo.py",
    "scripts/hash_review_password.mjs",
    "samples/eval_cases.json",
    "docs/eval-results.json",
    "docs/social-preview.png",
    "docs/adr/0001-use-n8n-as-orchestrator.md",
    "docs/adr/0002-deterministic-routing.md",
    "docs/adr/0003-audit-side-branch.md",
    "docs/adr/0004-sqlite-demo-store.md",
    "deploy/Caddyfile",
    "DEPLOYMENT.md",
    "CONTRIBUTING.md",
    "Makefile",
    ".github/dependabot.yml",
]

TRIAGE_NODES = [
    "Feedback Webhook",
    "Validate & Normalize",
    "Gemini Classify",
    "Validate LLM Output",
    "Deterministic Routing",
    "Build Success Response",
    "Build Error Response",
    "Audit Log (local)",
    "Respond to Webhook",
    "Prepare Escalation",
    "Notify Escalation",
    "Prepare Audit Persist",
    "Audit Persist Enabled?",
    "Persist Audit",
    "Audit Persisted",
]


def check(condition, label, detail=""):
    if condition:
        PASSES.append(label)
        print(f"PASS - {label}")
    else:
        FAILURES.append((label, detail))
        print(f"FAIL - {label}" + (f" ({detail})" if detail else ""))


def load_workflow(path):
    with open(ROOT / path) as f:
        return json.load(f)


def node_names(workflow):
    return {n["name"] for n in workflow["nodes"]}


def validate_connections(path, workflow):
    names = node_names(workflow)
    for source, connections in workflow["connections"].items():
        if source not in names:
            check(False, f"{path}: connection source exists", source)
            return
        for branch in connections.get("main", []):
            for target in branch:
                if target["node"] not in names:
                    check(False, f"{path}: connection target exists", target["node"])
                    return
    check(True, f"{path}: connections reference existing nodes")


def validate_triage():
    path = "n8n/feedbackops_ai.json"
    wf = load_workflow(path)
    names = node_names(wf)
    check(all(n in names for n in TRIAGE_NODES), f"{path}: required nodes present",
          ", ".join(sorted(n for n in TRIAGE_NODES if n not in names)))
    validate_connections(path, wf)

    webhook = next(n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.webhook")
    check(webhook["parameters"].get("authentication") == "headerAuth",
          f"{path}: webhook requires header auth")
    check("httpHeaderAuth" in webhook.get("credentials", {}),
          f"{path}: webhook references a Header Auth credential")

    gemini = next(n for n in wf["nodes"] if n["name"] == "Gemini Classify")
    check(gemini["parameters"]["url"].startswith(
        "https://generativelanguage.googleapis.com/"), f"{path}: LLM URL is fixed")

    persist = next(n for n in wf["nodes"] if n["name"] == "Persist Audit")
    check(persist["parameters"].get("url") == "={{ $json.audit_persist_url }}",
          f"{path}: audit persistence URL is env-driven")
    check("httpHeaderAuth" in persist.get("credentials", {}),
          f"{path}: audit persistence uses the Header Auth credential")
    prepare_audit = next(n for n in wf["nodes"] if n["name"] == "Prepare Audit Persist")
    prepare_code = prepare_audit["parameters"].get("jsCode", "")
    check("AUDIT_HMAC_SECRET" in prepare_code and "createHmac" in prepare_code,
          f"{path}: audit persistence supports HMAC")
    header_names = {
        h.get("name")
        for h in persist["parameters"].get("headerParameters", {}).get("parameters", [])
    }
    check({"X-Audit-Timestamp", "X-Audit-Signature"} <= header_names,
          f"{path}: audit persistence sends HMAC headers")

    serialized = json.dumps(wf)
    check(not any(p.search(serialized) for p in SECRET_PATTERNS),
          f"{path}: no secret material in export")


def validate_escalation():
    path = "n8n/escalation_workflow.json"
    wf = load_workflow(path)
    names = node_names(wf)
    for required in ["Escalation Webhook", "Validate Escalation", "Post to Slack",
                     "Build Escalation Result", "Respond to Escalation"]:
        check(required in names, f"{path}: node present", required)
    validate_connections(path, wf)
    webhook = next(n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.webhook")
    check(webhook["parameters"].get("authentication") == "headerAuth",
          f"{path}: webhook requires header auth")


def validate_digest():
    path = "n8n/weekly_digest_workflow.json"
    wf = load_workflow(path)
    names = node_names(wf)
    for required in ["Weekly Schedule", "Fetch Executions", "Build Digest", "Digest Log"]:
        check(required in names, f"{path}: node present", required)
    validate_connections(path, wf)
    trigger = next(n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.scheduleTrigger")
    check(bool(trigger["parameters"].get("rule", {}).get("interval")),
          f"{path}: schedule rule configured")


def validate_secrets():
    env_tracked = False
    try:
        tracked = subprocess.run(
            ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.splitlines()
        env_tracked = any(Path(p).name == ".env" for p in tracked)
        candidates = [ROOT / p for p in tracked]
    except (subprocess.CalledProcessError, FileNotFoundError):
        candidates = [
            p for p in ROOT.rglob("*")
            if p.is_file() and ".git" not in p.parts
            and "node_modules" not in p.parts and ".next" not in p.parts
        ]

    check(not env_tracked, "repository: .env is not tracked")

    leaks = []
    for path in candidates:
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".ico", ".lock"}:
            continue
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                leaks.append(str(path.relative_to(ROOT)))
                break
    check(not leaks, "repository: no secret material in tracked files", ", ".join(leaks))

    example = (ROOT / ".env.example").read_text()
    check("change_me_random_string" in example, ".env.example: uses a placeholder secret")
    check("WEBHOOK_SECRET=" in example, ".env.example: documents WEBHOOK_SECRET")


def validate_frontend():
    route = (ROOT / "frontend/app/api/triage/route.ts").read_text()
    check("process.env.WEBHOOK_SECRET" in route, "frontend: proxy reads secret server-side")
    check("NEXT_PUBLIC_" not in route, "frontend: secret is not exposed with NEXT_PUBLIC_")
    check("X-Webhook-Secret" in route, "frontend: proxy forwards the auth header")

    example = (ROOT / "frontend/.env.local.example").read_text()
    public_lines = [line for line in example.splitlines() if line.strip().startswith("NEXT_PUBLIC_")]
    check(not public_lines, "frontend: example env keeps secrets server-side")
    check("WEBHOOK_SECRET=" in example, "frontend: example env documents WEBHOOK_SECRET")


def validate_features():
    store = (ROOT / "frontend/lib/audit-store.mjs").read_text()
    check("node:sqlite" in store, "audit store: uses node:sqlite")
    check("AUDIT_DB_PATH" in store, "audit store: DB path is configurable")
    check("AUDIT_RETENTION_DAYS" in store, "audit store: retention is configurable")
    check("redact" in store.lower(), "audit store: PII redaction present")
    check("pruneAuditEvents" in store, "audit store: retention pruning exported")

    request_auth = (ROOT / "frontend/lib/request-auth.ts").read_text()
    check("x-audit-signature" in request_auth, "auth: HMAC signature header verified")
    check("x-audit-timestamp" in request_auth, "auth: HMAC timestamp verified")

    review_auth = (ROOT / "frontend/lib/review-auth.ts").read_text()
    check("scryptSync" in review_auth, "review auth: password hashes use scrypt")
    check("REVIEW_USERS" in review_auth, "review auth: per-user accounts supported")
    login_route = (ROOT / "frontend/app/api/auth/login/route.ts").read_text()
    check("verifyReviewerCredentials" in login_route, "login API: verifies reviewer identity")
    review_page = (ROOT / "frontend/app/review/page.tsx").read_text()
    check("getReviewSession" in review_page, "review page: session required")
    review_route = (ROOT / "frontend/app/api/review/route.ts").read_text()
    check("getReviewSession" in review_route, "review API: session required")
    check("session.username" in review_route, "review API: records reviewer identity")
    check("rateLimit" in review_route, "review API: rate limited")

    audit_route = (ROOT / "frontend/app/api/audit/route.ts").read_text()
    check("verifyAuditAuth" in audit_route, "audit API: secret/HMAC auth required")
    check("rateLimit" in audit_route, "audit API: rate limited")

    check("rateLimit" in login_route, "login API: rate limited")

    slack_route = (ROOT / "frontend/app/api/slack/actions/route.ts").read_text()
    check("verifySlackSignature" in slack_route, "slack API: signing-v0 verification required")
    check("SLACK_SIGNING_SECRET" in slack_route, "slack API: secret configurable")
    check("rateLimit" in slack_route, "slack API: rate limited")
    check("appendReviewUpdate" in slack_route, "slack API: records reviewer identity")

    slack_sig = (ROOT / "frontend/lib/slack-signature.ts").read_text()
    check("timingSafeEqual" in slack_sig, "slack signature: constant-time comparison")
    check("stale_timestamp" in slack_sig, "slack signature: stale timestamps rejected")

    stats_page = (ROOT / "frontend/app/stats/page.tsx").read_text()
    check("readAuditStats" in stats_page, "stats page: aggregates from the audit store")

    mcp_server = (ROOT / "scripts/mcp_audit_server.mjs").read_text()
    check("tools/list" in mcp_server, "MCP server: tools/list supported")
    check("initialize" in mcp_server, "MCP server: initialize handshake")
    for tool in ["audit_stats", "recent_audit_rows", "review_summary"]:
        check(tool in mcp_server, f"MCP server: exposes {tool}")
    check("readAuditState" in mcp_server and "readAuditStats" in mcp_server,
          "MCP server: backed by the audit store")

    knowledge_base = json.loads((ROOT / "samples/knowledge_base.json").read_text())
    check(len(knowledge_base.get("entries", [])) >= 8, "knowledge base: enough entries for grounding")
    check(all(entry.get("keywords") and entry.get("guidance")
              for entry in knowledge_base.get("entries", [])),
          "knowledge base: entries have keywords and guidance")

    health_route = (ROOT / "frontend/app/api/health/route.ts").read_text()
    check("audit_store" in health_route, "health: reports audit store")
    check("review_auth" in health_route, "health: reports review auth")

    compose = (ROOT / "docker-compose.yml").read_text()
    check("/api/health" in compose, "compose: healthcheck uses /api/health")
    check("frontend_data:/app/.data" in compose, "compose: persists SQLite data")
    check("REVIEW_SESSION_SECRET" in compose, "compose: review session secret wired")
    check("REVIEW_USERS" in compose, "compose: per-user reviewer accounts wired")
    check("NODE_FUNCTION_ALLOW_BUILTIN=crypto" in compose,
          "compose: n8n can sign HMAC audit bodies")

    env = (ROOT / ".env.example").read_text()
    for key in ["AUDIT_DB_PATH", "AUDIT_HMAC_SECRET", "AUDIT_RETENTION_DAYS",
                "REVIEW_USERS", "REVIEW_PASSWORD", "REVIEW_SESSION_SECRET",
                "SLACK_SIGNING_SECRET"]:
        check(key + "=" in env, f".env.example: documents {key}")

    cases = json.loads((ROOT / "samples/eval_cases.json").read_text())
    check(len(cases) == 30, "eval: 30 golden routing cases")

    ci = (ROOT / ".github/workflows/ci.yml").read_text()
    check("evaluate_policy.mjs" in ci, "CI: runs policy evaluation")
    check("test_api.mjs" in ci, "CI: runs API integration tests")


def validate_docs():
    license_text = (ROOT / "LICENSE").read_text()
    check("MIT License" in license_text, "LICENSE: MIT text present")
    readme = (ROOT / "README.md").read_text()
    check("## License" in readme, "README: license section present")
    check("docs/demo.png" in readme, "README: demo screenshot referenced")
    check("DEPLOYMENT.md" in readme, "README: deployment runbook referenced")
    check("docs/adr" in readme, "README: ADRs referenced")
    check("## Results" in readme, "README: evidence/results section present")
    for path in ["README.md", "SETUP.md"]:
        text = (ROOT / path).read_text()
        check(re.search(r"/home/(?!node(?:/|$))", text) is None
              and "@gmail.com" not in text,
              f"{path}: no local paths or personal email")


def main():
    for path in REQUIRED_FILES:
        check((ROOT / path).is_file(), f"required file: {path}")
    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed before workflow validation.")
        return 1

    validate_triage()
    validate_escalation()
    validate_digest()
    validate_secrets()
    validate_frontend()
    validate_features()
    validate_docs()

    print(f"\n== VALIDATION: {len(PASSES)} passed, {len(FAILURES)} failed ==")
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
