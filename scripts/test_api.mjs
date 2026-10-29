import assert from "node:assert/strict";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_API_PORT || 3102);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "api-test-webhook-secret";
const REVIEW_USERNAME = "api-reviewer";
const REVIEW_PASSWORD = "api-test-review-password";
const REVIEW_SALT = randomBytes(16);
const REVIEW_USERS = JSON.stringify({
  [REVIEW_USERNAME]: `scrypt$${REVIEW_SALT.toString("hex")}$${scryptSync(REVIEW_PASSWORD, REVIEW_SALT, 64).toString("hex")}`,
});
const SESSION_SECRET = "api-test-session-secret";
const HMAC_SECRET = "api-test-hmac-secret";
const dir = await mkdtemp(path.join(tmpdir(), "feedbackops-api-"));
const db = path.join(dir, "audit.sqlite");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: path.join(ROOT, "frontend"),
  env: {
    ...process.env,
    NODE_ENV: "production",
    WEBHOOK_SECRET: SECRET,
    REVIEW_USERS,
    REVIEW_USERNAME,
    REVIEW_SESSION_SECRET: SESSION_SECRET,
    AUDIT_DB_PATH: db,
    AUDIT_LOG_PATH: path.join(dir, "legacy.jsonl"),
    AUDIT_HMAC_SECRET: HMAC_SECRET,
    AUDIT_RETENTION_DAYS: "",
  },
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk.toString()));
server.stderr.on("data", (chunk) => (logs += chunk.toString()));

function stop() {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server did not start\n${logs}`);
}

async function request(pathname, options = {}) {
  return fetch(`${BASE}${pathname}`, { redirect: "manual", ...options });
}

function signedHeaders(body, timestamp = Date.now().toString()) {
  const signature = createHmac("sha256", HMAC_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "X-Webhook-Secret": SECRET,
    "X-Audit-Timestamp": timestamp,
    "X-Audit-Signature": signature,
  };
}

async function postAudit(row, { signed = true, timestamp, secret = SECRET } = {}) {
  const body = JSON.stringify(row);
  const headers = signed
    ? signedHeaders(body, timestamp)
    : { "Content-Type": "application/json", "X-Webhook-Secret": secret };
  return request("/api/audit", { method: "POST", headers, body });
}

try {
  await waitForServer();

  const health = await request("/api/health");
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.checks.audit_store, true);
  assert.equal(healthBody.checks.review_auth, true);

  const redirect = await request("/review");
  assert.equal(redirect.status, 307);
  assert.match(redirect.headers.get("location") || "", /\/login$/);

  const unauthReview = await request("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: "nope", status: "resolved" }),
  });
  assert.equal(unauthReview.status, 401);

  const wrongLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: REVIEW_USERNAME, password: "wrong" }),
  });
  assert.equal(wrongLogin.status, 401);

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ username: REVIEW_USERNAME, password: REVIEW_PASSWORD }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).reviewer, REVIEW_USERNAME);
  const cookie = (login.headers.getSetCookie() || [])[0]?.split(";")[0] || "";
  assert.ok(cookie.startsWith("feedbackops_review="));

  const authedReview = await request("/review", { headers: { cookie } });
  assert.equal(authedReview.status, 200);
  assert.match(await authedReview.text(), new RegExp(REVIEW_USERNAME));

  const unsigned = await postAudit({ request_id: "api-1" }, { signed: false });
  assert.equal(unsigned.status, 401);
  assert.equal((await unsigned.json()).error, "missing_signature");

  const stale = await postAudit(
    { request_id: "api-1" },
    { timestamp: String(Date.now() - 10 * 60 * 1000) }
  );
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).error, "stale_timestamp");

  const created = await postAudit({
    request_id: "api-1",
    summary: "API integration row",
    routing_decision: "review",
    review_status: "needs_review",
  });
  assert.equal(created.status, 201);

  const duplicate = await postAudit({
    request_id: "api-1",
    summary: "duplicate",
    routing_decision: "normal",
    review_status: "auto",
  });
  assert.equal(duplicate.status, 201);

  const resolved = await request("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ request_id: "api-1", status: "resolved" }),
  });
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).counts.total, 1);

  const missing = await request("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ request_id: "missing", status: "resolved" }),
  });
  assert.equal(missing.status, 404);

  const invalid = await request("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ request_id: "api-1", status: "pending" }),
  });
  assert.equal(invalid.status, 400);

  const logout = await request("/api/auth/logout", { method: "POST", headers: { cookie } });
  assert.equal(logout.status, 200);
  const cleared = (logout.headers.getSetCookie() || [])[0] || "";
  assert.match(cleared, /feedbackops_review=;/);

  const emptyHealth = await request("/api/health");
  assert.equal((await emptyHealth.json()).audit_rows, 1);

  let last;
  for (let index = 0; index < 11; index += 1) {
    last = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: REVIEW_USERNAME, password: "wrong" }),
    });
  }
  assert.equal(last.status, 429);

  const slackUnconfigured = await request("/api/slack/actions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "payload=%7B%7D",
  });
  assert.equal(slackUnconfigured.status, 503);
  assert.equal((await slackUnconfigured.json()).error, "not_configured");

  console.log("api integration: 27 assertions passed");
} finally {
  stop();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rm(dir, { recursive: true, force: true });
}
