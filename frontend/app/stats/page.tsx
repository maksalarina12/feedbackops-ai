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
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <div style={{ width: 150, fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 6, height: 18, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, background: color, height: "100%", borderRadius: 6 }} />
      </div>
      <div style={{ width: 34, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#101318" }}>{count}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px", letterSpacing: 0.3, textTransform: "uppercase", color: "#6b7280" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pct({ value, suffix }: { value: number | null; suffix: string }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 120 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#101318" }}>
        {value === null ? "—" : `${Math.round(value * 100)}%`}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{suffix}</div>
    </div>
  );
}

const PALETTE = ["#0d6d45", "#8a5a08", "#9f1d1d", "#1e4e8c", "#4b3b8f", "#384151", "#0b7285", "#5c4b8a"];

function Distribution({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  if (entries.length === 0) {
    return <div style={{ color: "#9ca3af", fontSize: 12 }}>No classified rows yet.</div>;
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

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: "0 20px" }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Stats</h1>
          <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Aggregates over the last {stats.window_days} days from the SQLite audit store.
            Aggregate counts only — no message-level content is shown here.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href="/" style={{ color: "#101318", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>
            Back to demo
          </Link>
          <Link href="/review" style={{ color: "#101318", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>
            Review queue &rarr;
          </Link>
        </div>
      </header>

      {stats.total === 0 ? (
        <section style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No audit rows in this window</div>
          <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Classify feedback from the demo page; once the workflow writes audit
            rows, aggregates appear here automatically.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: 14 }}>
          <Card title="Volume — last 7 days per day">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
              {stats.daily.map((entry) => (
                <div key={entry.day} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      background: "#0d6d45",
                      height: `${Math.max(3, Math.round((entry.total / maxDaily) * 70))}px`,
                      borderRadius: 4,
                      minWidth: 10,
                    }}
                    title={`${entry.day}: ${entry.total}`}
                  />
                  <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 4 }}>{entry.day.slice(5)}</div>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            <Card title="Routing decisions">
              <Distribution data={stats.by_route} />
            </Card>
            <Card title="Sentiment">
              <Distribution data={stats.by_sentiment} />
            </Card>
            <Card title="Category">
              <Distribution data={stats.by_category} />
            </Card>
            <Card title="Units (holding pattern)">
              <Distribution data={stats.by_unit} />
            </Card>
          </div>

          <Card title="Service quality">
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Pct value={stats.service.review_rate} suffix="review-required rate" />
              <Pct value={stats.service.rejection_rate} suffix="rejected pre-LLM" />
              <Pct value={stats.service.resolution_rate} suffix="resolution rate (reviewed items)" />
              <Pct value={stats.service.grounding_rate} suffix="KB-grounded suggestions" />
              <div style={{ flex: "1 1 130px", minWidth: 120 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#101318" }}>
                  {stats.service.avg_processing_ms === null ? "—" : `${stats.service.avg_processing_ms} ms`}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>avg processing time</div>
              </div>
              <div style={{ flex: "1 1 130px", minWidth: 120 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#101318" }}>{stats.service.llm_error_count}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>LLM errors (fail-safe) </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      <footer style={{ marginTop: 24, color: "#9ca3af", fontSize: 11, lineHeight: 1.6 }}>
        Aggregates only; the review queue keeps message-level data behind a
        reviewer session. Rates are measured from the local demo store, not
        invented benchmarks.
        <div style={{ marginTop: 10 }}>
          Built by <strong>Maksalmina</strong> ·{" "}
          <a href="https://maksalmina-arina.vercel.app" target="_blank" rel="noreferrer" style={{ color: "#9ca3af" }}>
            portfolio
          </a>
        </div>
      </footer>
    </main>
  );
}
