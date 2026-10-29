# Design changelog

## v3 — 2026-10-29 — "Control room" dark console (rich-density pass)

- Direction change: light "paper" theme → dark operations console.
  Reason: user feedback that v2 felt empty/under-designed.
- Fonts: system-only → Space Grotesk (display) + JetBrains Mono (data),
  self-hosted via @fontsource (builds stay hermetic).
- New tokens: near-black surfaces, hairline borders, semantic status colors
  with dark tints, signal-green accent for live/ok, focus ring green.
- New components: console topbar (brand dot + tag + nav), hero band + split
  hero, pipeline strip (live dots), workflow spec list (mono key/value),
  numbered steps, colophon footer, semantic bar-color mapping on /stats.
- Anti-slop fixes carried over: bars no longer use an 8-color decorative
  palette (was a v2 contract violation); semantic mapping now enforced in
  /stats code.
- Adsense-to-value: every new section carries real system facts, no filler.

## v2 — 2026-10-29 — light paper ledger (superseded)

- Introduced token system, dot-status chips, micro-labels, tabular nums,
  radius 8/5/4, zero shadows. Superseded by v3 direction change.

## v1 — earlier

- Default Tailwind-ish inline styling (removed).
