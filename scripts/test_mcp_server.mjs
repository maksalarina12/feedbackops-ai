import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await mkdtemp(path.join(tmpdir(), "feedbackops-mcp-"));
const db = path.join(dir, "audit.sqlite");

// Seed the store the same way the app does, then talk MCP over stdio.
const { appendAuditRow, appendReviewUpdate } = await import("../frontend/lib/audit-store.mjs");
process.env.AUDIT_DB_PATH = db;
process.env.AUDIT_RETENTION_DAYS = "";
await appendAuditRow({
  request_id: "mcp-1",
  source: "demo_ui",
  unit: "retail",
  sentiment: "negative",
  category: "shipping",
  urgency: "low",
  summary: "Order stuck in transit",
  routing_decision: "normal",
  routing_reasons: ["all fields validated -> routine processing"],
  review_status: "auto",
  response_grounded: true,
  kb_source: "kb-shipping-delays",
  processing_duration_ms: 311,
});
await appendAuditRow({
  request_id: "mcp-2",
  source: "demo_ui",
  unit: "logistics",
  summary: "Charged twice, need help",
  routing_decision: "review",
  review_status: "needs_review",
});

const child = spawn("node", [path.join(ROOT, "scripts/mcp_audit_server.mjs")], {
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
});
child.stderr.on("data", () => {}); // readiness banner lives on stderr

let pending = 0;
const pendingIds = new Map();
let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id && pendingIds.has(message.id)) {
      const resolve = pendingIds.get(message.id);
      pendingIds.delete(message.id);
      resolve(message);
    }
  }
});

function rpc(method, params) {
  const id = ++pending;
  const message = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => {
    pendingIds.set(id, resolve);
    child.stdin.write(message + "\n");
    setTimeout(() => {
      if (pendingIds.has(id)) {
        pendingIds.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 5000);
  });
}

let passed = 0;
let totalChecks = 0;
function check(condition, message) {
  totalChecks += 1;
  assert.ok(Boolean(condition), message || "check failed");
  passed += 1;
}

try {
  const initialized = await rpc("initialize", { protocolVersion: "2025-06-18" });
  check(initialized.result.serverInfo.name === "feedbackops-audit");
  check(initialized.result.capabilities && "tools" in initialized.result.capabilities);
  check(initialized.result.protocolVersion === "2025-06-18");

  const pong = await rpc("ping");
  check("result" in pong);

  const list = await rpc("tools/list");
  const names = list.result.tools.map((tool) => tool.name);
  check(JSON.stringify(names) === JSON.stringify(["audit_stats", "recent_audit_rows", "review_summary"]));
  check(list.result.tools.every((tool) => tool.inputSchema && typeof tool.description === "string"));

  const stats = await rpc("tools/call", { name: "audit_stats", arguments: { window_days: 7 } });
  const statsPayload = JSON.parse(stats.result.content[0].text);
  check(statsPayload.total === 2);
  check(statsPayload.by_route.review === 1 && statsPayload.by_route.normal === 1);
  check(statsPayload.by_unit.retail === 1 && statsPayload.by_unit.logistics === 1);
  check(statsPayload.service && typeof statsPayload.service.avg_processing_ms === "number", "service-quality block present");
  check(statsPayload.by_category.shipping >= 1, "category tally present");

  const rows = await rpc("tools/call", { name: "recent_audit_rows", arguments: { limit: 5 } });
  const rowsPayload = JSON.parse(rows.result.content[0].text);
  check(Array.isArray(rowsPayload.rows) && rowsPayload.rows.length === 2);
  const seededRow = rowsPayload.rows.find((row) => row.request_id === "mcp-1");
  check(seededRow && Array.isArray(seededRow.routing_reasons) && seededRow.routing_reasons.length === 1, "reasons survive the MCP round-trip");

  const summary = await rpc("tools/call", { name: "review_summary" });
  const summaryPayload = JSON.parse(summary.result.content[0].text);
  check(summaryPayload.open_items.length === 1);
  check(summaryPayload.open_items[0].request_id === "mcp-2");
  check(summaryPayload.open_items[0].route === "review");

  const unknown = await rpc("tools/call", { name: "nonexistent_tool" });
  check(unknown.error && unknown.error.code === -32602);

  const badMethod = await rpc("resources/list");
  check(badMethod.error && badMethod.error.code === -32601);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rm(dir, { recursive: true, force: true });
}

console.log(`mcp server: ${passed} assertions passed`);
process.exit(passed === totalChecks ? 0 : 1);
