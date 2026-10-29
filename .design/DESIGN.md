# FeedbackOps AI — Design Contract (canonical visual rules)

**v3 — "Control room" dark operations console (2026-10-29)**

## Thesis

> FeedbackOps AI should feel like a **precision operations console / control
> room**, because it is an audit-and-triage system for engineers, using a
> dark, data-dense terminal language: near-black surfaces, hairline borders,
> mono micro-labels, tabular numerals, one signal-green accent for positive
> state, semantic color reserved for status. Rich but not decorative — every
> section carries real system facts (workflow spec, pipeline, steps, KPIs).

Reference synthesis (do not copy):
- **Linear** — dark panels with hairline borders; accent only where meant.
- **Vercel** — white-on-dark primary CTA, monochrome discipline.
- **Grafana-class consoles** — status-first semantics; bars only from real data.

## Typography

| Role | Font | Notes |
|---|---|---|
| Display / headings / brand / big KPIs | **Space Grotesk** (500/600/700, self-hosted via @fontsource) | page titles 34px → 27px mobile, `letter-spacing -0.02em` |
| Body / UI | `system-ui` stack | 13.5px, lh 1.55–1.6 |
| Data / labels / meta / spec keys | **JetBrains Mono** (400/600/700, @fontsource) | request IDs, trace lines, `.micro` 10px uppercase `ls .1em` |
| Numerals | `tabular-nums` | all counts, durations, rates |

## Color (dark, semantic only)

```
--bg  #0c0f13   --surface #12161c   --surface-2 #181d24
--border #232a33  --border-strong #333c47
--ink #e8ebef   --muted #9aa4af   --faint #66707c
--ok #3ecf8e / --ok-bg #10281c
--warn #e8b13f / --warn-bg #292113
--err #ff7a70 / --err-bg #2b1513
--info #6ea8fe / --info-bg #13223b
--track #1d232b
```

- Interactive primary = light ink button (`--ink` bg, `#0c0f13` text), hover pure white.
- Signal green = live/ok state only (brand dot, pipeline live nodes, step numbers, `:focus-visible`).
- Bars: semantic mapping (normal/positive→ok, review/mixed→warn,
  high_priority/negative→err, explicit fail-safes→muted; others info).

## Shape & depth

- Radius: card 10 · control 6 · chip 4. Borders 1px; **no shadows, no blur,
  no pill radius**. One exception: 3px green ring on "live" dots (state, not
  decoration).

## Layout / density

- Container 1040px, padding 24. Split hero 1.45fr/1fr → single column < 780px.
- Console chrome: topbar (brand + tag + nav), hero band (micro-label strip),
  panels with `.panel-head`.
- Signature elements: (1) console topbar with green brand dot, (2) **pipeline
  strip** `validate → classify → route → audit` with live dots, (3) **workflow
  spec list** — mono key/value rows with real system facts, (4) `⌙` trace
  prefix, (5) numbered steps 01/02/03, (6) colophon footer.
- Stars/stats: KPI tiles flex min 140px; review rows compact ledger cards.

## Motion

None by default; states only (hover border/color, disabled opacity). Nothing
animates → reduced-motion is trivially respected.

## Anti-patterns (blocked)

Purple/blue gradients · multi-color decorative bar palettes · shadows/glass ·
pill radius · giant centered hero · fake metrics (stats are store-computed
only, contract exposes "invented metrics: none").

## Pages

- `/` demo: hero thesis + spec + pipeline → input → scenarios (with guard
  explanation) → result ledger → how-it-works steps → colophon.
- `/review`: hero + session spec rows → KPI tiles → unit filter tabs → ledger
  rows → colophon.
- `/stats`: hero + "invented metrics: none" spec → volume bars → semantic
  distributions → service-quality KPIs → colophon.
- `/login`: hero + protection-model spec → form panel.
