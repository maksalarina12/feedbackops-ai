import { log } from "../../../../lib/logger";
import { rateLimit } from "../../../../lib/rate-limit";
import { appendReviewUpdate } from "../../../../lib/audit-store.mjs";
import { verifySlackSignature } from "../../../../lib/slack-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Slack interactive callback for the escalation workflow's approve buttons.
 * Auth model: instead of the same-origin rule used by browser routes, this
 * endpoint relies on Slack's signing-v0 HMAC (same guarantee class as the
 * HMAC-verified /api/audit). Requires SLACK_SIGNING_SECRET.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 30, windowMs: 60_000, scope: "slack-actions" });
  if (!limited.ok) {
    return new Response("Too many requests. Try again shortly.", { status: 429 });
  }

  const signingSecret = process.env.SLACK_SIGNING_SECRET || "";
  const rawBody = await request.text();
  const verified = verifySlackSignature({
    signingSecret,
    signature: request.headers.get("x-slack-signature"),
    timestamp: request.headers.get("x-slack-timestamp"),
    rawBody,
  });
  if (!verified.ok) {
    log("warn", "slack_actions_auth_failed", { reason: verified.reason });
    return Response.json(
      { error: verified.reason },
      { status: verified.reason === "not_configured" ? 503 : 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new URLSearchParams(rawBody).get("payload") || "{}");
  } catch {
    payload = {};
  }
  const container = payload as {
    user?: { username?: string; name?: string; id?: string };
    actions?: Array<{ value?: string }>;
  };

  const action = Array.isArray(container.actions) ? container.actions[0] : null;
  const value = typeof action?.value === "string" ? action.value : "";
  const match = /^(resolve|needs_review):(.{1,128})$/.exec(value);
  if (!match) {
    return Response.json({ error: "unsupported_action", value }, { status: 400 });
  }

  const reviewer =
    (container.user?.username || container.user?.name || container.user?.id || "slack-user")
      .slice(0, 48) + " (slack)";
  const requestId = match[2].trim();

  try {
    await appendReviewUpdate({
      request_id: requestId,
      status: match[1] as "resolved" | "needs_review",
      reviewer,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    const status = code === "request_not_found" ? 404 : code === "invalid_status" ? 400 : 500;
    log("warn", "slack_actions_update_failed", { code, request_id: requestId });
    return Response.json({ error: code }, { status });
  }

  log("info", "slack_actions_update", { request_id: requestId, reviewer });
  return new Response("FeedbackOps: queued update applied.", { status: 200 });
}
