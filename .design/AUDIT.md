# Visual audit (v2 redesign, 2026-10-29)

## Identity
- [x] Aesthetic thesis: precision operations console / audit ledger
- [x] Product-specific anchors: panel header strip, ledger trace (⌙), dot chips
- [x] No template identity (no purple gradient, no glass, no generic hero)

## Typography
- [x] Exact stacks: system-ui UI + ui-monospace data (no font download needed
  offline — deliberate, keeps Docker builds hermetic)
- [x] Scale 26/15/13.5/12/10; micro-labels uppercase mono
- [x] tabular-nums on all counts/durations

## Color
- [x] All colors via tokens in globals.css; no hex scattered mid-page
  (status bg/fg use var(--*) tokens)
- [x] Semantic-only color; primary interactive = ink black
- [x] Focus: 2px ink outline, 2px offset, :focus-visible

## Shape / depth
- [x] Radius system 8/5/4; no pill (999) anywhere (old chips were 999)
- [x] Zero shadows; 1px borders; one surface-2 header band per page

## Layout / density
- [x] Demo 760px, review/stats 1000px; denser than v1 (padding 16–20)
- [x] Review rows: chips row → summary → mono meta/trace → actions right
- [x] Mobile: single column, wraps; unit filter tabs wrap; no horizontal scroll

## Components
- [x] .panel / .panel-head / .chip / .chip-solid / .btn* / .field / .navlink /
  .micro / .mono / .tnum — extracted to globals.css (was: repeated inline)
- [x] States: disabled (opacity .45), hover on primary/navlink, error text blocks

## Regression evidence (all executed after redesign)
- tsc --noEmit clean; next build OK (11 routes)
- test_api 27/27 · routing 8/8 · audit 41 · slack 7 · mcp 18 · repo 143/143
- Live render QA: /, /stats markup verified (panel-head ×3 home; stats KPI
  labels present; /review 307 → /login unauthenticated; css chunk served)

## Known weaknesses / next
- Screenshot assets (docs/demo.png, review.png, social-preview.png) still show
  the v1 design — re-capture after deploy
- Login page is intentionally minimal; could take the header strip for parity
  if public pages grow
- No motion system by design; if added later, keep to status feedback only
