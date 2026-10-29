# FeedbackOps AI — Design Contract (canonical visual rules)

## Thesis

> FeedbackOps AI should feel like a **precision operations console**, because it
> is an audit-and-triage system for engineers, using a data-dense ledger
> language: hairline borders, monospaced data, status-only color, zero
> decorative noise. The interviewer should read it as "built by someone who
> ships internal tooling," not "assembled from a SaaS template."

Reference synthesis (do not copy):
- **Mercury** — calm monochrome, tabular numerals, money/data in neutrals →
  borrow restraint + tabular data treatment. NOT the onyx financial-dark.
- **Linear** — charcoal panels with hairline borders, accent only where meant
  → borrow borders-over-shadows hierarchy. NOT the dark theme (we are light).
- **Observability consoles (Grafana-class)** — status-first semantics, dense
  aggregates → borrow the dot-status system and bar language. NOT colorful
  noisy dashboards.

## Typography

| Role | Stack | Notes |
|---|---|---|
| UI / body | `system-ui, -apple-system, "Segoe UI", sans-serif` | 13–14px body |
| Data / IDs / label micro | `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace` | request IDs, numerals, panel labels |
| Micro-labels | same mono, 10–11px, `uppercase`, `letter-spacing: .08em`, muted | panel headers, column heads |
| Scale | 26 (page title) / 15 (section) / 13.5 body / 12.5 meta / 10–11 micro | line-height 1.5–1.6 body |
| Numerals | `font-variant-numeric: tabular-nums` | all counts, durations, percentages |

## Color (semantic roles only — no decorative color)

```
--bg:            #f7f7f3   (warm paper)
--surface:       #ffffff
--surface-2:     #f2f2ee
--border:        #e4e4de
--border-strong: #c9c9c1
--ink:           #16181d
--ink-hover:     #262930   (primary button hover)
--muted:         #565b64
--faint:         #83878f
--ok:   #0d6d45  bg #e5f3ea    --warn:  #8a5a08 bg #f9f2e2
--err:  #9f1d1d  bg #faeaea    --info:  #1e4e8c bg #e9f1fa
--track: #e9e9e3        (bars/progress background)
```

Color is reserved for STATUS (route chips, review state, error text) and
nothing else. Interactive primary = ink black.

## Shape

- Card / panel radius **8**; control radius **5**; chip radius **4**.
- Borders **1px solid** always; no shadows anywhere; no blur/glass.
- No pill radius (999) anywhere.

## Spacing

`4 / 8 / 12 / 16 / 24 / 32 / 48`. Page padding 24. Panel padding 16–20.
Container: demo 760px · review/stats 1000px · margin-top 32.

## Density & grid

- Data-dense; single-column narrative with sectioned panels.
- Stat tiles: flex row, auto-fit, min 140px, 8px gaps.
- Review rows as compact list cards with a mono meta line.
- Focus state: 2px ink outline, 2px offset. Visible always.

## Signature elements (memorable anchors)

1. **Panel header strip** — mono uppercase micro-label + hairline rule
   (e.g. `TRIAGE · INTELLIGENT FEEDBACK ROUTING`).
2. **Ledger result card** — machine-classification box: mono request_id at top
   right, grid of labelled fields, "routed because" trace list with `⌙` mono
   prefix, suggested response as an indented draft block.
3. **Dot-status chips** — 6px dot + label in a 4px-radius chip, semantic color.

## Motion

None by default. State transitions only: cursor, opacity, disabled. Respect
reduced motion implicitly (nothing animates).

## Anti-patterns (blocked)

Purple/blue gradients · glassmorphism · shadows on every surface · pill radius
· hover-lift · icon-per-noun · generic purple SaaS hero · 999-radius badges as
primary language · decorative blobs · lorem/placeholder copy · meaningless
charts (/stats bars are computed from real store data, never decoration).
