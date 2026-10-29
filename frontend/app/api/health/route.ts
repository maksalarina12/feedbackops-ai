import { NextResponse } from "next/server";
import { readAuditState } from "../../../lib/audit-store.mjs";
import { reviewAuthConfigured } from "../../../lib/review-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readAuditState({ limit: 1 });
    return NextResponse.json({
      ok: true,
      checks: {
        audit_store: true,
        review_auth: reviewAuthConfigured(),
      },
      audit_rows: state.total,
      uptime_s: Math.round(process.uptime()),
    });
  } catch {
    return NextResponse.json(
      { ok: false, checks: { audit_store: false } },
      { status: 503 }
    );
  }
}
