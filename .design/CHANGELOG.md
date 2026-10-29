# Design changelog

## v4 — 2026-10-29 — clean & soft light

- Direction change per feedback: v3 dark console read as "too AI".
- Skin: dark → warm off-white; status colors desaturated (soft sage/amber/
  rose/steel); fonts → Manrope everywhere (headings 800), JetBrains Mono
  demoted to IDs/data only; micro-labels switched from mono-uppercase to
  sans uppercase faint.
- Softened radii (12/8/6) + one faint 1px shadow per card for softness.
- Removed glow (live-dot rings), radial gradients, dark-surface hierarchy.
- Kept from v3: information richness (spec lists, pipeline, steps, KPIs,
  colophon) — content unchanged, chrome calmed.
- Fixes: re-added .btn-solid after v3 css rewrite; review FilterTab active
  text color corrected for light theme.

## v3 — 2026-10-29 — dark "control room" console (superseded)

- Rich-density pass: topbar, split hero, pipeline, spec list, steps,
  colophon; Space Grotesk + JetBrains Mono. Superseded by v4.

## v2 — earlier in 2026-10-29 — light paper ledger

- Token system, dot chips, tabular nums, zero shadows. Felt under-designed.

## v1 — initial

- Default inline styling (removed).
