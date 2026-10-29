import { NextResponse } from "next/server";
import { log } from "../../../lib/logger";
import { rateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WEBHOOK = "http://localhost:5678/webhook/feedbackops";
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 45_000;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, request_id: "unknown", error: { code, message } },
    { status }
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 30, windowMs: 60_000, scope: "triage" });
  if (!limited.ok) {
    const response = errorResponse("rate_limited", "Too many requests. Try again shortly.", 429);
    response.headers.set("Retry-After", String(limited.retryAfter));
    return response;
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL || DEFAULT_WEBHOOK;
  const secret = process.env.WEBHOOK_SECRET || "";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_json", "Request body must be valid JSON.", 400);
  }

  const payload = JSON.stringify(body);
  if (Buffer.byteLength(payload, "utf8") > MAX_BODY_BYTES) {
    return errorResponse("request_too_large", "Request body exceeds 16 KB.", 413);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Webhook-Secret"] = secret;

  try {
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return errorResponse(
        `upstream_${upstream.status}`,
        "The triage service returned a non-JSON response.",
        upstream.status
      );
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    log("error", "triage_upstream_failed", { timedOut });
    return errorResponse(
      "upstream_unreachable",
      timedOut
        ? `The triage service did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s.`
        : "Cannot reach the n8n webhook. Is the n8n container running?",
      502
    );
  }
}
