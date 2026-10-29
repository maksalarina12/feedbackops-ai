#!/usr/bin/env node
// FeedbackOps AI — MCP (Model Context Protocol) audit server, stdio transport.
//
// Exposes read-only tools over the SQLite demo audit store so an MCP client
// (n8n agent, Claude, any MCP host) can ask operational questions like
// "what is stuck in review?" without shell or file access.
//
// Protocol: JSON-RPC 2.0, newline-delimited JSON on stdin/stdout (MCP stdio).
// No external dependencies; implements only what this server needs:
//   initialize / ping / notifications (ignored) / tools/list / tools/call
//
// Run: AUDIT_DB_PATH=.data/audit.sqlite node scripts/mcp_audit_server.mjs

import {
  readAuditState,
  readAuditStats,
  storePath,
} from "../frontend/lib/audit-store.mjs";

const SERVER_INFO = { name: "feedbackops-audit", version: "1.0.0" };

const TOOLS = [
  {
    name: "audit_stats",
    description:
      "Aggregate triage statistics (routing, sentiment, categories, units, resolution and grounding rates) over a rolling window. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        window_days: {
          type: "number",
          description: "Rolling window in days (1-90, default 7).",
        },
      },
    },
  },
  {
    name: "recent_audit_rows",
    description:
      "Most recent audit rows, newest first. Rows are PII-redacted at write time. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "1-100 rows (default 25)." },
      },
    },
  },
  {
    name: "review_summary",
    description:
      "Counts plus the open items (needs_review) that a reviewer still has to resolve. Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
];

function textResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

async function callTool(name, args = {}) {
  switch (name) {
    case "audit_stats": {
      const windowDays = Number.isFinite(Number(args.window_days)) ? Number(args.window_days) : 7;
      const stats = await readAuditStats({ days: Math.max(1, Math.min(windowDays, 90)) });
      // Do not leak the filesystem path to the client context.
      const { store, ...statsOnly } = stats;
      return textResult({ store_path_disclosed: false, ...statsOnly });
    }
    case "recent_audit_rows": {
      const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Math.min(Number(args.limit), 100)) : 25;
      const state = await readAuditState({ limit });
      return textResult({
        total: state.total,
        counts: state.counts,
        rows: state.rows.map(({ review_note, ...rest }) => rest),
      });
    }
    case "review_summary": {
      const state = await readAuditState({ limit: 100 });
      const open = state.rows.filter((row) => row.review_status === "needs_review");
      return textResult({
        counts: state.counts,
        open_items: open.map((row) => ({
          request_id: row.request_id,
          created_at: row.created_at,
          route: row.routing_decision,
          reasons: row.routing_reasons,
          summary: row.summary,
          source: row.source,
          unit: row.unit,
        })),
      });
    }
    default:
      return null;
  }
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function replyError(id, code, message, data) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }) + "\n"
  );
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      replyError(null, -32700, "Parse error");
      continue;
    }

    const { id, method } = message;
    if (method === "initialize") {
      reply(id, {
        protocolVersion: (message.params && message.params.protocolVersion) || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
      continue;
    }
    if (typeof method !== "string") {
      if (id !== undefined) replyError(id, -32600, "Invalid Request");
      continue;
    }
    if (method.startsWith("notifications/")) continue; // no response for notifications
    if (method === "ping") {
      reply(id, {});
      continue;
    }
    if (method === "tools/list") {
      reply(id, { tools: TOOLS });
      continue;
    }
    if (method === "tools/call") {
      const params = message.params || {};
      callTool(params.name, params.arguments)
        .then((result) => {
          if (result === null) replyError(id, -32602, "Unknown tool", { name: params.name });
          else reply(id, result);
        })
        .catch((error) =>
          replyError(id, -32603, "Tool execution failed", {
            reason: error instanceof Error ? error.message : String(error),
          })
        );
      continue;
    }
    if (id !== undefined) replyError(id, -32601, "Method not found");
  }
});

process.stdin.on("end", () => process.exit(0));
process.stderr.write(`feedbackops-audit MCP server ready (store: ${storePath()})\n`);
