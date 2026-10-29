import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAuditState } from "../../lib/audit-store.mjs";
import type { AuditRow } from "../../lib/audit-store.mjs";
import { getReviewSession } from "../../lib/review-auth";
import LogoutButton from "./LogoutButton";
import ReviewActions from "./ReviewActions";

export const dynamic = "force-dynamic";

const ROUTE_STYLE: Record<string, { bg: string; fg: string }> = {
  high_priority: { bg: "#9f1d1d", fg: "#fff" },
  review: { bg: "#8a5a08", fg: "#fff" },
  normal: { bg: "#0d6d45", fg: "#fff" },
  rejected: { bg: "#4b5563", fg: "#fff" },
};

function routeLabel(row: AuditRow): string {
  if (row.status === "rejected_pre_llm") return "rejected";
  return (row.routing_decision || "unknown").toLowerCase();
}

function statusLabel(row: AuditRow): string {
  if (row.review_status === "resolved") return "resolved";
  if (row.review_status === "needs_review") return "needs review";
  if (row.review_status === "auto") return "auto-processed";
  if (row.status === "rejected_pre_llm") return "rejected pre-LLM";
  return "logged";
}

function statusStyle(row: AuditRow): { bg: string; fg: string } {
  if (row.review_status === "resolved") return { bg: "#e5f6ed", fg: "#085d3a" };
  if (row.review_status === "needs_review") return { bg: "#fdf3e0", fg: "#8a5a08" };
  if (row.review_status === "auto") return { bg: "#e5f6ed", fg: "#085d3a" };
  return { bg: "#eef1f4", fg: "#384151" };
}

function formatDate(value: string | null): string {
  if (!value) return "unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ flex: "1 1 130px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: "#6b7280", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1.2, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const store = await cookies();
  const session = getReviewSession(store.toString());
  if (!session) redirect("/login");
  const params = await searchParams;
  const activeUnit = typeof params.unit === "string" && params.unit.trim() ? params.unit.trim() : null;

  const state = await readAuditState({ limit: 100 });
  const { rows: allRows, counts } = state;
  const units = [...new Set(allRows.map((row) => row.unit).filter((unit): unit is string => !!unit))].sort();
  const rows = activeUnit ? allRows.filter((row) => row.unit === activeUnit) : allRows;

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: "0 20px" }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Review queue</h1>
          <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Persistent audit rows written by the n8n workflow. Items routed to
            human review stay here until they are marked resolved.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
            {session.username}
          </span>
          <LogoutButton />
          <Link href="/stats" style={{ color: "#101318", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>
            Stats
          </Link>
          <Link href="/" style={{ color: "#101318", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>
            Back to demo
          </Link>
        </div>
      </header>

      <section style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat label="Total" value={counts.total} accent="#101318" />
        <Stat label="Needs review" value={counts.needs_review} accent="#8a5a08" />
        <Stat label="Resolved" value={counts.resolved} accent="#0d6d45" />
        <Stat label="Auto-processed" value={counts.auto} accent="#0d6d45" />
        <Stat label="Rejected" value={counts.rejected} accent="#4b5563" />
      </section>

      {units.length > 0 && (
        <section style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Unit:</span>
          <Link
            href="/review"
            style={{
              border: activeUnit ? "1px solid #d1d5db" : "1px solid #101318",
              background: activeUnit ? "#fff" : "#101318",
              color: activeUnit ? "#101318" : "#fff",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            all
          </Link>
          {units.map((unit) => (
            <Link
              key={unit}
              href={`/review?unit=${encodeURIComponent(unit)}`}
              style={{
                border: activeUnit === unit ? "1px solid #101318" : "1px solid #d1d5db",
                background: activeUnit === unit ? "#101318" : "#fff",
                color: activeUnit === unit ? "#fff" : "#101318",
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {unit}
            </Link>
          ))}
        </section>
      )}

      {rows.length === 0 ? (
        <section style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No audit rows yet</div>
          <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Set <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>AUDIT_WEBHOOK_URL</code> on
            n8n, then classify feedback from the demo. Rows are written to the
            SQLite path configured by <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>AUDIT_DB_PATH</code>.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => {
            const route = routeLabel(row);
            const routeStyle = ROUTE_STYLE[route] ?? { bg: "#eef1f4", fg: "#384151" };
            const accent = statusStyle(row);
            const needsReview = row.review_status === "needs_review";
            const resolved = row.review_status === "resolved";
            const canReview = needsReview || resolved;

            return (
              <article key={row.request_id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: routeStyle.bg, color: routeStyle.fg, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                      {route}
                    </span>
                    <span style={{ background: accent.bg, color: accent.fg, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                      {statusLabel(row)}
                    </span>
                    {row.source && (
                      <span style={{ color: "#6b7280", fontSize: 12 }}>via {row.source}</span>
                    )}
                    {row.unit && (
                      <span style={{ background: "#eef1f4", color: "#384151", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        unit: {row.unit}
                      </span>
                    )}
                    {row.response_grounded === true && row.kb_source && (
                      <span style={{ background: "#e8f1fb", color: "#1e4e8c", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        KB: {row.kb_source}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: 11 }}>{formatDate(row.created_at)}</div>
                </div>

                <p style={{ fontSize: 14, color: "#111827", lineHeight: 1.55, margin: "12px 0 0" }}>
                  {row.summary || row.error_code || "No summary provided."}
                </p>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                  <div style={{ color: "#6b7280", fontSize: 11, lineHeight: 1.6 }}>
                    <div>
                      {row.request_id}
                      {row.category ? ` · ${row.category}` : ""}
                      {row.urgency ? ` · urgency ${row.urgency}` : ""}
                      {row.processing_duration_ms !== null ? ` · ${row.processing_duration_ms} ms` : ""}
                    </div>
                    {resolved && row.reviewed_at && (
                      <div>
                        resolved{row.reviewed_by ? ` by ${row.reviewed_by}` : ""} {formatDate(row.reviewed_at)}
                      </div>
                    )}
                    {row.llm_error && <div style={{ color: "#8a5a08" }}>llm_note: {row.llm_error}</div>}
                    {Array.isArray(row.routing_reasons) && row.routing_reasons.length > 0 && (
                      <div>routed because: {row.routing_reasons.join("; ")}</div>
                    )}
                  </div>
                  {canReview && <ReviewActions requestId={row.request_id} resolved={resolved} />}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <footer style={{ marginTop: 24, color: "#9ca3af", fontSize: 11, lineHeight: 1.6 }}>
        Showing up to 100 most recent rows from the SQLite demo store.
        Replace it with Postgres or another durable store before production.
        Review actions are appended as events; rows are never mutated in place.
        <div style={{ marginTop: 10 }}>
          Built by <strong>Maksalmina</strong> — full-stack &amp; AI workflow
          engineering ·{" "}
          <a
            href="https://maksalmina-arina.vercel.app"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#6b7280", textDecoration: "underline" }}
          >
            portfolio
          </a>
        </div>
      </footer>
    </main>
  );
}
