import { NextResponse } from "next/server";
import { appendAuditRow } from "../../../lib/audit-store.mjs";
import { log } from "../../../lib/logger";
import { rateLimit } from "../../../lib/rate-limit";
import { verifyAuditAuth } from "../../../lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 120, windowMs: 60_000, scope: "audit" });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  if (!process.env.WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "audit_secret_not_configured" },
      { status: 503 }
    );
  }

  const raw = await request.text();

  const auth = verifyAuditAuth(request, raw);
  if (!auth.ok) {
    log("warn", "audit_auth_failed", { reason: auth.error });
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.error === "unauthorized" ? 403 : 401 }
    );
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    const row = await appendAuditRow(body);
    return NextResponse.json({ ok: true, request_id: row.request_id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "audit_write_failed";
    const status = message === "request_id_required" ? 400 : 500;
    log("error", "audit_write_failed", {
      error: message,
      request_id: typeof body.request_id === "string" ? body.request_id : null,
    });
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
