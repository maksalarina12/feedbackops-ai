import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasValidWebhookSecret(request: Request): boolean {
  const expected = process.env.WEBHOOK_SECRET || "";
  if (!expected) return false;
  return safeEqual(expected, request.headers.get("x-webhook-secret") || "");
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function verifyAuditAuth(
  request: Request,
  rawBody: string
): { ok: true } | { ok: false; error: string } {
  if (!hasValidWebhookSecret(request)) return { ok: false, error: "unauthorized" };

  const hmacSecret = process.env.AUDIT_HMAC_SECRET || "";
  if (!hmacSecret) return { ok: true };

  const timestamp = request.headers.get("x-audit-timestamp") || "";
  const signature = request.headers.get("x-audit-signature") || "";
  if (!timestamp || !signature) return { ok: false, error: "missing_signature" };

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false, error: "stale_timestamp" };
  }

  const expected = createHmac("sha256", hmacSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return safeEqual(expected, signature) ? { ok: true } : { ok: false, error: "bad_signature" };
}

export function signAuditBody(rawBody: string, timestamp = Date.now().toString()) {
  const hmacSecret = process.env.AUDIT_HMAC_SECRET || "";
  if (!hmacSecret) return { timestamp, signature: "" };
  return {
    timestamp,
    signature: createHmac("sha256", hmacSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex"),
  };
}
