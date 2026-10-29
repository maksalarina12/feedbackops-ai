import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAuditState } from "../../lib/audit-store.mjs";
import type { AuditRow } from "../../lib/audit-store.mjs";
import { getReviewSession } from "../../lib/review-auth";
import LogoutButton from "./LogoutButton";
import ReviewActions from "./ReviewActions";

export const dynamic = "force-dynamic";

type Chip = { bg: string; fg: string; label: string };

const ROUTE_CHIP: Record<string, Chip> = {
  high_priority: { bg: "var(--err)", fg: "#fff", label: "high priority" },
  review: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "review" },
  normal: { bg: "var(--ok-bg)", fg: "var(--ok)", label: "normal" },
  rejected: { bg: "var(--surface-2)", fg: "var(--muted)", label: "rejected" },
};

const STATUS_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  resolved: { bg: "var(--ok-bg)", fg: "var(--ok)", label: "resolved" },
  needs_review: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "needs review" },
  auto: { bg: "var(--ok-bg)", fg: "var(--ok)", label: "auto-processed" },
  logged: { bg: "var(--surface-2)", fg: "var(--muted)", label: "logged" },
};

function routeChip(row: AuditRow): Chip {
  if (row.status === "rejected_pre_llm") return ROUTE_CHIP.rejected;
  const route = (row.routing_decision || "unknown").toLowerCase();
  return ROUTE_CHIP[route] ?? { bg: "var(--surface-2)", fg: "var(--muted)", label: route || "unknown" };
}

function statusChip(row: AuditRow): Chip {
  return (
    STATUS_CHIP[row.review_status ?? "logged"] ?? STATUS_CHIP.logged
  );
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
    <div style={{ flex: "1 1 140px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", padding: "12px 16px" }}>
      <div className="micro">{label}</div>
      <div
        className="tnum"
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: accent,
          lineHeight: 1.25,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FilterTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="btn"
      style={
        active
          ? { background: "var(--ink)", borderColor: "var(--ink)", color: "#fff", padding: "4px 12px", fontSize: 12 }
          : { padding: "4px 12px", fontSize: 12 }
      }
    >
      {label}
    </Link>
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
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: "0 24px", paddingBottom: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="panel" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div
          className="panel-head"
          style={{ margin: 0, padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
        >
          <span className="micro">FeedbackOps · Review queue</span>
          <span className="micro">append-only · reviewer-attributed</span>
        </div>
        <div style={{ padding: "18px 20px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 520 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
              Review queue
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.55 }}>
              Persistent audit rows written by the workflow. Items routed to
              human review stay open until a reviewer resolves them; actions
              append events, history is never rewritten.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
              {session.username}
            </span>
            <LogoutButton />
            <Link href="/stats" className="navlink">
              Stats
            </Link>
            <Link href="/" className="navlink">
              Back to demo →
            </Link>
          </div>
        </div>
      </header>

      {/* ── Counters ───────────────────────────────────────── */}
      <section style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat label="Total" value={counts.total} accent="var(--ink)" />
        <Stat label="Needs review" value={counts.needs_review} accent="var(--warn)" />
        <Stat label="Resolved" value={counts.resolved} accent="var(--ok)" />
        <Stat label="Auto-processed" value={counts.auto} accent="var(--ok)" />
        <Stat label="Rejected" value={counts.rejected} accent="var(--muted)" />
      </section>

      {/* ── Unit filter ────────────────────────────────────── */}
      {units.length > 0 && (
        <section style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="micro" style={{ letterSpacing: "0.08em" }}>
            Unitfilter
          </span>
          <FilterTab href="/review" label={`all · ${allRows.length}`} active={!activeUnit} />
          {units.map((unit) => {
            const count = allRows.filter((row) => row.unit === unit).length;
            return (
              <FilterTab
                key={unit}
                href={`/review?unit=${encodeURIComponent(unit)}`}
                label={`${unit} · ${count}`}
                active={activeUnit === unit}
              />
            );
          })}
        </section>
      )}

      {/* ── Rows ───────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <section
          className="panel"
          style={{ borderStyle: "dashed", padding: 28, textAlign: "center" }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>
            {activeUnit ? `No audit rows for unit “${activeUnit}”` : "No audit rows yet"}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 480, marginInline: "auto" }}>
            Set <code className="mono">AUDIT_WEBHOOK_URL</code> on n8n, then
            classify feedback from the demo. Rows persist to the SQLite path
            configured by <code className="mono">AUDIT_DB_PATH</code>.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => {
            const route = routeChip(row);
            const status = statusChip(row);
            const resolved = row.review_status === "resolved";
            const needsReview = row.review_status === "needs_review";
            const canReview = needsReview || resolved;

            return (
              <article
                key={row.request_id}
                className="panel"
                style={{ padding: "14px 18px" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className="chip-solid" style={{ background: route.bg, color: route.fg }}>
                      {route.label}
                    </span>
                    <span className="chip" style={{ background: status.bg, color: status.fg }}>
                      <span className="dot" style={{ background: status.fg }} />
                      {status.label}
                    </span>
                    {row.unit && (
                      <span className="chip" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                        {/* holding-company unit tag */}
                        <b className="mono">{row.unit}</b>
                      </span>
                    )}
                    {row.response_grounded === true && row.kb_source && (
                      <span className="chip" style={{ background: "var(--info-bg)", color: "var(--info)" }}>
                        kb: <b className="mono">{row.kb_source}</b>
                      </span>
                    )}
                    {row.source && (
                      <span className="mono" style={{ color: "var(--faint)", fontSize: 11 }}>
                        · via {row.source}
                      </span>
                    )}
                  </div>
                  <span className="mono tnum" style={{ color: "var(--faint)", fontSize: 11 }}>
                    {formatDate(row.created_at)}
                  </span>
                </div>

                <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.55, margin: "10px 0 0", maxWidth: "72ch" }}>
                  {row.summary || row.error_code || "No summary provided."}
                </p>

                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                  <div className="mono" style={{ color: "var(--faint)", fontSize: 11, lineHeight: 1.7, display: "grid" }}>
                    <span>
                      {row.request_id}
                      {row.category ? ` · ${row.category}` : ""}
                      {row.urgency ? ` · urgency ${row.urgency}` : ""}
                      {row.processing_duration_ms !== null ? ` · ${row.processing_duration_ms} ms` : ""}
                    </span>
                    {Array.isArray(row.routing_reasons) && row.routing_reasons.length > 0 && (
                      <span>{row.routing_reasons.map((reason) => `⌙ ${reason}`).join("  ")}</span>
                    )}
                    {row.llm_error && <span style={{ color: "var(--warn)" }}>⌙ llm_note: {row.llm_error}</span>}
                    {resolved && row.reviewed_at && (
                      <span>
                        resolved{row.reviewed_by ? ` by ${row.reviewed_by}` : ""} {formatDate(row.reviewed_at)}
                      </span>
                    )}
                  </div>
                  {canReview && <ReviewActions requestId={row.request_id} resolved={resolved} />}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer style={{ marginTop: 24, color: "var(--faint)", fontSize: 11, lineHeight: 1.7, maxWidth: "70ch" }}>
        Showing up to 100 most recent rows from the SQLite demo store. Replace
        it with Postgres or another durable store before production. Review
        actions are appended as events; rows are never mutated in place.
        <div style={{ marginTop: 10 }}>
          Built by <b>Maksalmina</b> ·{" "}
          <a className="textlink" href="https://maksalmina-arina.vercel.app" target="_blank" rel="noreferrer">
            portfolio
          </a>
        </div>
      </footer>
    </main>
  );
}
