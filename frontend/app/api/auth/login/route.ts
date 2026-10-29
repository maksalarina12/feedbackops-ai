import { NextResponse } from "next/server";
import { log } from "../../../../lib/logger";
import { rateLimit } from "../../../../lib/rate-limit";
import { isSameOrigin } from "../../../../lib/request-auth";
import {
  createSessionToken,
  isSecureRequest,
  reviewAuthConfigured,
  sessionCookie,
  verifyReviewerCredentials,
} from "../../../../lib/review-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000, scope: "login" });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "cross_origin_denied" }, { status: 403 });
  }

  if (!reviewAuthConfigured()) {
    return NextResponse.json({ ok: false, error: "review_auth_not_configured" }, { status: 503 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const reviewer = verifyReviewerCredentials(username, password);
  if (!reviewer) {
    log("warn", "review_login_failed", {
      ip: request.headers.get("x-forwarded-for") || "local",
    });
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, reviewer });
  response.headers.set(
    "Set-Cookie",
    sessionCookie(createSessionToken(reviewer), isSecureRequest(request))
  );
  log("info", "review_login_ok", { reviewer });
  return response;
}
