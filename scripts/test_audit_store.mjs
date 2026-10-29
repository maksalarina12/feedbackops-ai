import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  appendAuditRow,
  appendReviewUpdate,
  pruneAuditEvents,
  readAuditState,
  readAuditStats,
  storePath,
} from "../frontend/lib/audit-store.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "feedbackops-audit-"));
const file = path.join(dir, "audit.sqlite");
process.env.AUDIT_DB_PATH = file;
process.env.AUDIT_LOG_PATH = path.join(dir, "legacy.jsonl");
process.env.AUDIT_RETENTION_DAYS = "";

try {
  assert.equal(storePath(), file);

  const empty = await readAuditState();
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.counts, {
    total: 0,
    needs_review: 0,
    resolved: 0,
    auto: 0,
    rejected: 0,
  });

  await appendAuditRow({
    request_id: "req-1",
    created_at: "2026-01-01T10:00:00.000Z",
    source: "demo_ui",
    sentiment: "negative",
    category: "billing",
    urgency: "high",
    summary: "Charged twice for one order",
    routing_decision: "high_priority",
    review_status: "needs_review",
    processing_duration_ms: 512,
  });

  await appendAuditRow({
    request_id: "req-2",
    created_at: "2026-01-01T11:00:00.000Z",
    source: "api",
    sentiment: "neutral",
    category: "shipping",
    urgency: "low",
    summary: "Where is my order?",
    routing_decision: "normal",
    review_status: "auto",
    processing_duration_ms: 430,
  });

  await appendAuditRow({
    request_id: "req-3",
    created_at: "2026-01-01T12:00:00.000Z",
    source: "api",
    summary: "message rejected before the LLM",
    status: "rejected_pre_llm",
    error_code: "message_too_long",
  });

  await appendAuditRow({
    request_id: "req-1",
    created_at: "2026-01-01T10:00:00.000Z",
    summary: "duplicate audit write",
    routing_decision: "high_priority",
    review_status: "needs_review",
  });

  let state = await readAuditState();
  assert.equal(state.total, 3, "audit writes are idempotent per request_id");
  assert.equal(state.rows.length, 3);
  assert.equal(state.rows[0].request_id, "req-3");
  assert.equal(state.rows.find((row) => row.request_id === "req-1").summary, "Charged twice for one order");
  assert.equal(state.counts.needs_review, 1);
  assert.equal(state.counts.auto, 1);
  assert.equal(state.counts.rejected, 1);

  await appendReviewUpdate({ request_id: "req-1", status: "resolved" });
  state = await readAuditState();
  assert.equal(state.counts.needs_review, 0);
  assert.equal(state.counts.resolved, 1);
  const resolved = state.rows.find((row) => row.request_id === "req-1");
  assert.equal(resolved.review_status, "resolved");
  assert.ok(resolved.reviewed_at);

  await appendReviewUpdate({ request_id: "req-1", status: "needs_review" });
  state = await readAuditState();
  assert.equal(state.counts.resolved, 0);
  assert.equal(state.counts.needs_review, 1);
  assert.equal(state.rows.find((row) => row.request_id === "req-1").review_status, "needs_review");

  await appendReviewUpdate({ request_id: "req-2", status: "resolved" });
  await appendAuditRow({
    request_id: "req-2",
    created_at: "2026-01-01T11:00:00.000Z",
    summary: "retried audit event",
    routing_decision: "normal",
    review_status: "auto",
  });
  state = await readAuditState();
  const retried = state.rows.find((row) => row.request_id === "req-2");
  assert.equal(retried.review_status, "resolved", "review state survives a retried audit event");
  assert.equal(state.total, 3);

  await assert.rejects(
    () => appendReviewUpdate({ request_id: "missing", status: "resolved" }),
    /request_not_found/
  );

  await appendAuditRow({
    request_id: "req-redact",
    created_at: "2026-01-01T13:00:00.000Z",
    summary: "Email jane@example.com or +62 812-3456-7890, card 4111 1111 1111 1111",
    routing_decision: "review",
    review_status: "needs_review",
  });
  state = await readAuditState();
  const redacted = state.rows.find((row) => row.request_id === "req-redact").summary;
  assert.match(redacted, /\[email\]/);
  assert.match(redacted, /\[phone\]/);
  assert.match(redacted, /\[card\]/);
  assert.doesNotMatch(redacted, /jane@example\.com|4111/);

  assert.equal((await readAuditState({ limit: 2 })).rows.length, 2);
  assert.equal((await readAuditState({ limit: 0 })).rows.length, 1);

  await assert.rejects(() => appendAuditRow({ summary: "missing id" }), /request_id_required/);
  await assert.rejects(
    () => appendReviewUpdate({ request_id: "req-1", status: "nope" }),
    /invalid_status/
  );

  const removed = await pruneAuditEvents({ days: 30 });
  assert.equal(removed, 4, "retention deletes every row older than the cutoff");
  assert.equal((await readAuditState()).total, 0);

  const legacyDir = await mkdtemp(path.join(tmpdir(), "feedbackops-legacy-"));
  const legacyFile = path.join(legacyDir, "legacy.jsonl");
  process.env.AUDIT_DB_PATH = path.join(legacyDir, "migrated.sqlite");
  process.env.AUDIT_LOG_PATH = legacyFile;
  await appendFile(legacyFile, JSON.stringify({
    type: "audit",
    request_id: "legacy-1",
    created_at: "2026-01-02T10:00:00.000Z",
    summary: "legacy row",
    routing_decision: "review",
    review_status: "needs_review",
  }) + "\n" + JSON.stringify({
    type: "review_update",
    request_id: "legacy-1",
    review_status: "resolved",
    updated_at: "2026-01-02T11:00:00.000Z",
  }) + "\n", "utf8");
  const migrated = await readAuditState();
  assert.equal(migrated.total, 1);
  assert.equal(migrated.rows[0].review_status, "resolved");
  await rm(legacyDir, { recursive: true, force: true });

  // New fields: unit, routing_reasons, KB grounding metadata, suggested_response.
  await appendAuditRow({
    request_id: "req-fields",
    source: "demo_ui",
    unit: "retail",
    sentiment: "negative",
    category: "shipping",
    urgency: "low",
    summary: "Package late and tracking stuck",
    routing_decision: "normal",
    routing_reasons: ["all fields validated -> routine processing", "contact +6281234567 x in summary?"],
    review_status: "auto",
    suggested_response: "Shipping usually takes 3-5 days. Reach me at ops@example.com please.",
    response_grounded: true,
    kb_source: "kb-shipping-delays",
    processing_duration_ms: 250,
  });
  const fielded = await readAuditState({ limit: 10 });
  const fieldRow = fielded.rows.find((row) => row.request_id === "req-fields");
  assert.equal(fieldRow.unit, "retail");
  assert.deepEqual(
    fieldRow.routing_reasons,
    ["all fields validated -> routine processing", "contact [phone] x in summary?"],
    "routing reasons should be stored as redacted strings"
  );
  assert.equal(fieldRow.response_grounded, true);
  assert.equal(fieldRow.kb_source, "kb-shipping-delays");
  assert.match(fieldRow.suggested_response, /\[email\]/, "suggested_response must be PII-redacted");

  // Stats aggregation over the last 7 days (older fixture rows fall outside
  // the window; only the fresh row above should be counted).
  const stats = await readAuditStats({ days: 7 });
  assert.equal(stats.total, 1);
  assert.equal(stats.by_route.normal, 1);
  assert.equal(stats.by_category.shipping, 1);
  assert.equal(stats.by_unit.retail, 1);
  assert.equal(stats.service.avg_processing_ms > 0, true);
  assert.equal(stats.service.grounding_rate > 0, true);
  assert.equal(stats.daily.length, 7);
  assert.equal(stats.window_days, 7);

  console.log("audit store: 41 assertions passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
