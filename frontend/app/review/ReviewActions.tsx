"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReviewActions({
  requestId,
  resolved,
}: {
  requestId: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(status: "resolved" | "needs_review") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, status }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `review_update_failed_${response.status}`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "review_update_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button
        type="button"
        onClick={() => update(resolved ? "needs_review" : "resolved")}
        disabled={loading}
        className={resolved ? "btn" : "btn btn-solid"}
        style={{ padding: "6px 12px", fontSize: 12 }}
      >
        {loading ? "Saving…" : resolved ? "Reopen" : "Mark resolved"}
      </button>
      {error && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
