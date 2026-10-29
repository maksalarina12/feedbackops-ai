import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Slack Signing verification ( signing v0 ).
 * Format: v0=hex(HMAC_SHA256(secret, "v0:" + timestamp + ":" + rawBody))
 * Slack docs: reject requests older than 5 minutes.
 */
export const SLACK_STALE_MS = 5 * 60 * 1000;

export function slackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string
): string {
  return createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
}

export function verifySlackSignature({
  signingSecret,
  signature,
  timestamp,
  rawBody,
  now = Date.now(),
}: {
  signingSecret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!signingSecret) return { ok: false, reason: "not_configured" };
  if (!signature || !timestamp) return { ok: false, reason: "missing_signature" };

  if (!/^v0=[0-9a-f]{64}$/i.test(signature)) {
    return { ok: false, reason: "wrong_signature_format" };
  }

  const tsNumber = Number(timestamp);
  if (!Number.isFinite(tsNumber) || timestamp.replace(/[^\d]/g, "") !== timestamp) {
    return { ok: false, reason: "wrong_timestamp_format" };
  }

  // Slack sends seconds; accept millisecond timestamps too (test tooling).
  const moment = tsNumber < 10_000_000_000 ? tsNumber * 1000 : tsNumber;
  const age = Math.abs(now - moment);
  if (age > SLACK_STALE_MS) return { ok: false, reason: "stale_timestamp" };

  const expected = slackSignature(signingSecret, timestamp, rawBody);
  const a = Buffer.from(signature.slice(3), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "wrong_signature" };
  }
  return { ok: true };
}
