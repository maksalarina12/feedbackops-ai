import { NextResponse } from "next/server";
import { isSameOrigin } from "../../../../lib/request-auth";
import { clearSessionCookie, isSecureRequest } from "../../../../lib/review-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "cross_origin_denied" }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie(isSecureRequest(request)));
  return response;
}
