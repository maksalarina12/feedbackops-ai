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
        style={{
          background: resolved ? "#fff" : "#0d6d45",
          color: resolved ? "#374151" : "#fff",
          border: resolved ? "1px solid #d1d5db" : "1px solid #0d6d45",
          borderRadius: 8,
          padding: "7px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Saving…" : resolved ? "Reopen" : "Mark resolved"}
      </button>
      {error && <div style={{ color: "#9f1d1d", fontSize: 11, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
