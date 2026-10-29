import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MAX_STRING = 300;
const MAX_ROWS = 5000;
let cached = null;
let lastPrune = 0;

function text(value, max = MAX_STRING) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, max)
    : null;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function redact(value, max = MAX_STRING) {
  let result = text(value, max);
  if (!result) return null;
  result = result
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]")
    .replace(/(?:\+62|62|0)8[\d\s().-]{7,14}\d/g, "[phone]")
    .replace(/\+\d{1,3}[\s.-]?(?:\d[\s.-]?){7,14}\d/g, "[phone]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card]");
  return result;
}

export function storePath() {
  return process.env.AUDIT_DB_PATH || path.join(process.cwd(), ".data", "audit.sqlite");
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('audit', 'review')),
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_once
      ON audit_events(request_id) WHERE type = 'audit';
    CREATE INDEX IF NOT EXISTS idx_events_request
      ON audit_events(request_id, id);
    CREATE INDEX IF NOT EXISTS idx_events_created
      ON audit_events(created_at);
  `);
}

async function migrateJsonl(db, file) {
  const legacy = process.env.AUDIT_LOG_PATH || path.join(path.dirname(file), "audit.jsonl");
  let raw;
  try {
    raw = await readFile(/*turbopackIgnore: true*/ legacy, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  db.exec("BEGIN");
  try {
    const audit = db.prepare(
      "INSERT OR IGNORE INTO audit_events (request_id, type, created_at, payload) VALUES (?, 'audit', ?, ?)"
    );
    const review = db.prepare(
      "INSERT INTO audit_events (request_id, type, created_at, payload) VALUES (?, 'review', ?, ?)"
    );
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!event || typeof event.request_id !== "string") continue;
      if (event.type === "review_update") {
        review.run(
          event.request_id,
          event.updated_at || new Date().toISOString(),
          JSON.stringify(event)
        );
      } else {
        audit.run(
          event.request_id,
          event.created_at || new Date().toISOString(),
          JSON.stringify(event)
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function openDb() {
  const file = storePath();
  if (cached && cached.file === file) return cached.db;

  if (cached) {
    cached.db.close();
    cached = null;
  }

  await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  ensureSchema(db);
  const count = db.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE type = 'audit'").get();
  if (!count || count.total === 0) {
    await migrateJsonl(db, file);
  }
  cached = { file, db };
  return db;
}

export async function appendAuditRow(row) {
  const requestId = text(row && row.request_id, 128);
  if (!requestId) throw new Error("request_id_required");

  const record = {
    request_id: requestId,
    created_at: text(row.created_at, 40) || new Date().toISOString(),
    stored_at: new Date().toISOString(),
    source: redact(row.source, 64),
    sentiment: text(row.sentiment, 32),
    category: text(row.category, 32),
    urgency: text(row.urgency, 32),
    summary: redact(row.summary),
    routing_decision: text(row.routing_decision, 32),
    review_status: row.review_status === "needs_review"
      ? "needs_review"
      : row.review_status === "auto"
        ? "auto"
        : null,
    status: text(row.status, 32),
    error_code: text(row.error_code, 64),
    llm_error: redact(row.llm_error, 128),
    processing_duration_ms: number(row.processing_duration_ms),
  };

  const db = await openDb();
  db.prepare(
    "INSERT OR IGNORE INTO audit_events (request_id, type, created_at, payload) VALUES (?, 'audit', ?, ?)"
  ).run(requestId, record.created_at, JSON.stringify(record));
  return record;
}

export async function appendReviewUpdate({ request_id, status, note, reviewer }) {
  const requestId = text(request_id, 128);
  if (!requestId) throw new Error("request_id_required");
  if (status !== "resolved" && status !== "needs_review") throw new Error("invalid_status");

  const updatedAt = new Date().toISOString();
  const record = {
    type: "review_update",
    request_id: requestId,
    review_status: status,
    note: redact(note, 500),
    reviewer: text(reviewer, 64),
    updated_at: updatedAt,
  };

  const db = await openDb();
  const exists = db.prepare(
    "SELECT 1 AS found FROM audit_events WHERE request_id = ? AND type = 'audit' LIMIT 1"
  ).get(requestId);
  if (!exists) throw new Error("request_not_found");

  db.prepare(
    "INSERT INTO audit_events (request_id, type, created_at, payload) VALUES (?, 'review', ?, ?)"
  ).run(requestId, updatedAt, JSON.stringify(record));
}

export async function pruneAuditEvents({ days } = {}) {
  const retention = days ?? Number(process.env.AUDIT_RETENTION_DAYS || 0);
  if (!Number.isFinite(retention) || retention <= 0) return 0;
  const cutoff = new Date(Date.now() - retention * 24 * 60 * 60 * 1000).toISOString();
  const db = await openDb();
  const result = db.prepare("DELETE FROM audit_events WHERE created_at < ?").run(cutoff);
  return result.changes ?? 0;
}

export async function readAuditState({ limit = 100 } = {}) {
  const db = await openDb();
  if (Date.now() - lastPrune > 60_000) {
    lastPrune = Date.now();
    await pruneAuditEvents();
  }

  const rows = db.prepare(`
    SELECT
      a.request_id,
      a.created_at,
      a.payload AS audit_payload,
      (
        SELECT r.payload FROM audit_events r
        WHERE r.request_id = a.request_id AND r.type = 'review'
        ORDER BY r.id DESC LIMIT 1
      ) AS review_payload
    FROM audit_events a
    WHERE a.type = 'audit'
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(MAX_ROWS);

  const all = rows.map((row) => {
    let audit;
    let review;
    try {
      audit = JSON.parse(row.audit_payload);
    } catch {
      audit = {};
    }
    try {
      review = row.review_payload ? JSON.parse(row.review_payload) : null;
    } catch {
      review = null;
    }

    return {
      request_id: row.request_id,
      created_at: audit.created_at || row.created_at || null,
      source: audit.source || null,
      sentiment: audit.sentiment || null,
      category: audit.category || null,
      urgency: audit.urgency || null,
      summary: audit.summary || null,
      routing_decision: audit.routing_decision || null,
      review_status: review ? review.review_status : audit.review_status || null,
      status: audit.status || null,
      error_code: audit.error_code || null,
      llm_error: audit.llm_error || null,
      processing_duration_ms: audit.processing_duration_ms ?? null,
      review_note: review ? review.note || null : null,
      reviewed_by: review ? review.reviewer || null : null,
      reviewed_at: review ? review.updated_at || null : null,
    };
  });

  const counts = {
    total: all.length,
    needs_review: all.filter((row) => row.review_status === "needs_review").length,
    resolved: all.filter((row) => row.review_status === "resolved").length,
    auto: all.filter((row) => row.review_status === "auto").length,
    rejected: all.filter((row) => row.status === "rejected_pre_llm").length,
  };

  return {
    rows: all.slice(0, Math.max(1, Math.min(limit, 500))),
    counts,
    total: all.length,
    store: storePath(),
  };
}
