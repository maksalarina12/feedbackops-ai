import Link from "next/link";
import { readAuditStats } from "../../lib/audit-store.mjs";
import type { AuditStats } from "../../lib/audit-store.mjs";

export const dynamic = "force-dynamic";

function Bar({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
      <div className="mono" style={{ width: 150, fontSize: 11.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div style={{ flex: 1, background: "var(--track)", borderRadius: 2, height: 16, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, background: color, height: "100%" }} />
      </div>
      <div className="tnum" style={{ width: 32, textAlign: "right", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </div>
    </div>
  );
}

function Card({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="panel" style={{ padding: "14px 18px 18px" }}>
      <div className="panel-head" style={{ marginBottom: 12 }}>
        <span className="micro">{title}</span>
        {meta && <span className="micro tnum">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 130 }}>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1 }}>{hint}</div>
    </div>
  );
}

const PALETTE = [
  "var(--ok)",
  "var(--warn)",
  "var(--err)",
  "var(--info)",
  "#4b3b8f",
  "var(--ink)",
  "#0b7285",
  "#5c4b8a",
];

function Distribution({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  if (entries.length === 0) {
    return <div style={{ color: "var(--faint)", fontSize: 12 }}>No classified rows yet.</div>;
  }
  return (
    <div>
      {entries.map(([label, count], index) => (
        <Bar key={label} label={label} count={count} max={max} color={PALETTE[index % PALETTE.length]} />
      ))}
    </div>
  );
}

export default async function StatsPage() {
  const stats: AuditStats = await readAuditStats({ days: 7 });
  const maxDaily = Math.max(1, ...stats.daily.map((entry) => entry.total));
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: "0 24px", paddingBottom: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="panel" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div
          className="panel-head"
          style={{ margin: 0, padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
        >
          <span className="micro">FeedbackOps · Operations stats</span>
          <span className="micro tnum">window: {stats.window_days} days</span>
        </div>
        <div style={{ padding: "18px 20px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 520 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
              Stats
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.55 }}>
              Aggregates over the last {stats.window_days} days, computed from
              the SQLite audit store. Counts and rates only — message-level
              content stays behind reviewer sign-in at{" "}
              <Link href="/review" className="textlink">
                /review
              </Link>
              .
            </p>
          </div>
          <Link href="/" className="navlink">
            Back to demo →
          </Link>
        </div>
      </header>

      {stats.total === 0 ? (
        <section className="panel" style={{ borderStyle: "dashed", padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>
            No audit rows in this window
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 480, marginInline: "auto" }}>
            Classify feedback from the demo page; once the workflow writes audit
            rows, aggregates appear here automatically.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: 12 }}>
          {/* Volume */}
          <Card title="Volume per day" meta={`${stats.total} rows in window`}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 88 }}>
              {stats.daily.map((entry) => (
                <div key={entry.day} style={{ flex: 1, textAlign: "center", minWidth: 18 }}>
                  <div
                    title={`${entry.day}: ${entry.total}`}
                    style={{
                      background: "var(--ok)",
                      height: `${Math.max(3, Math.round((entry.total / maxDaily) * 64))}px`,
                      borderRadius: 2,
                      opacity: entry.total === 0 ? 0.25 : 1,
                    }}
                  />
                  <div className="mono" style={{ fontSize: 9, color: "var(--faint)", marginTop: 4 }}>
                    {entry.day.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Distributions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
            <Card title="Routing decisions">
              <Distribution data={stats.by_route} />
            </Card>
            <Card title="Sentiment">
              <Distribution data={stats.by_sentiment} />
            </Card>
            <Card title="Category">
              <Distribution data={stats.by_category} />
            </Card>
            <Card title="Units">
              <Distribution data={stats.by_unit} />
            </Card>
          </div>

          {/* Service quality */}
          <Card title="Service quality" meta={`store rows: ${stats.total}`}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Kpi
                value={pct(stats.service.review_rate)}
                label="review-required"
                hint="share routed to human review"
              />
              <Kpi
                value={pct(stats.service.rejection_rate)}
                label="rejected pre-LLM"
                hint="caught by validation, zero AI spend"
              />
              <Kpi
                value={pct(stats.service.resolution_rate)}
                label="resolution rate"
                hint="resolved / reviewed items"
              />
              <Kpi
                value={pct(stats.service.grounding_rate)}
                label="grounded suggestions"
                hint="matched a knowledge-base entry"
              />
              <Kpi
                value={stats.service.avg_processing_ms === null ? "—" : `${stats.service.avg_processing_ms} ms`}
                label="avg processing"
                hint="validate → classify → route"
              />
              <Kpi
                value={String(stats.service.llm_error_count)}
                label="LLM errors"
                hint="fail-safe events, never silent passes"
              />
            </div>
          </Card>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer style={{ marginTop: 24, color: "var(--faint)", fontSize: 11, lineHeight: 1.7, maxWidth: "70ch" }}>
        Aggregates only; the review queue keeps message-level data behind a
        reviewer session. Rates are measured from the local demo store, not
        invented benchmarks.
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
