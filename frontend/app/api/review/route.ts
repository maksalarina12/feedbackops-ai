import { NextResponse } from "next/server";
import { appendReviewUpdate, readAuditState } from "../../../lib/audit-store.mjs";
import { log } from "../../../lib/logger";
import { rateLimit } from "../../../lib/rate-limit";
import { isSameOrigin } from "../../../lib/request-auth";
import { getReviewSession } from "../../../lib/review-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 60, windowMs: 60_000, scope: "review" });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "cross_origin_denied" }, { status: 403 });
  }

  const session = getReviewSession(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  }

  let body: { request_id?: unknown; status?: unknown; note?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.status !== "resolved" && body.status !== "needs_review") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  try {
    await appendReviewUpdate({
      request_id: String(body.request_id ?? ""),
      status: body.status,
      note: typeof body.note === "string" ? body.note : "",
      reviewer: session.username,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "review_write_failed";
    const status = message === "request_id_required"
      ? 400
      : message === "request_not_found"
        ? 404
        : 500;
    log("error", "review_update_failed", { error: message, reviewer: session.username });
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const state = await readAuditState({ limit: 1 });
  return NextResponse.json({ ok: true, counts: state.counts });
}
