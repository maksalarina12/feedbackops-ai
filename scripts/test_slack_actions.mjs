import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SLACK_STALE_MS,
  slackSignature,
  verifySlackSignature,
} from "../frontend/lib/slack-signature.ts";
import {
  appendAuditRow,
  appendReviewUpdate,
  readAuditState,
} from "../frontend/lib/audit-store.mjs";

const secret = "slack-test-signing-secret";
const body = "payload=%7B%22actions%22%3A%5B%7B%22value%22%3A%22resolve%3Aapi-1%22%7D%5D%7D";
const ts = Math.floor(Date.now() / 1000).toString();
const sig = `v0=${slackSignature(secret, ts, body)}`;

let passed = 0;
function check(condition, message) {
  assert.ok(Boolean(condition), message || "check failed");
  passed += 1;
}

// Signature verification (pure function — the HTTP layer is exercised by
// scripts/test_api.mjs).
const good = verifySlackSignature({ signingSecret: secret, signature: sig, timestamp: ts, rawBody: body });
check(good.ok === true, `valid signature accepted: ${JSON.stringify(good)}`);

const notConfigured = verifySlackSignature({ signingSecret: "", signature: sig, timestamp: ts, rawBody: body });
check(notConfigured.ok === false && notConfigured.reason === "not_configured");

check(verifySlackSignature({ signingSecret: secret, signature: null, timestamp: ts, rawBody: body }).reason === "missing_signature");

check(verifySlackSignature({ signingSecret: secret, signature: sig.slice(0, -2), timestamp: ts, rawBody: body }).reason === "wrong_signature_format");

const stale = Math.floor((Date.now() - SLACK_STALE_MS - 1000) / 1000).toString();
check(verifySlackSignature({
  signingSecret: secret,
  signature: `v0=${slackSignature(secret, stale, body)}`,
  timestamp: stale,
  rawBody: body,
}).reason === "stale_timestamp", "stale timestamps must be rejected");

check(verifySlackSignature({
  signingSecret: secret,
  signature: sig,
  timestamp: ts,
  rawBody: `${body}&extra=1`,
}).reason === "wrong_signature", "tampered body must be rejected");

// End-to-end state change through the same store helper the route calls:
// slack reviewer identity lands in the audit event trail.
const dir = await mkdtemp(path.join(tmpdir(), "feedbackops-slack-"));
process.env.AUDIT_DB_PATH = path.join(dir, "audit.sqlite");
process.env.AUDIT_RETENTION_DAYS = "";
try {
  await appendAuditRow({
    request_id: "api-1",
    routing_decision: "review",
    review_status: "needs_review",
  });
  await appendReviewUpdate({
    request_id: "api-1",
    status: "resolved",
    reviewer: "maksalmina (slack)",
  });
  const state = await readAuditState({ limit: 10 });
  const row = state.rows.find((item) => item.request_id === "api-1");
  check(row.review_status === "resolved" && row.reviewed_by === "maksalmina (slack)");
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(`slack signature: ${passed} assertions passed`);
process.exit(passed === 7 ? 0 : 1);
