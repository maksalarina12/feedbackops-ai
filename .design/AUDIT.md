# Visual audit (v4 clean & soft redesign, 2026-10-29)

## Identity
- [x] Aesthetic thesis: control-room ops console (dark)
- [x] Product anchors: console topbar, pipeline strip, workflow spec list,
      `⌙` trace, numbered steps, semantic bars
- [x] No template identity (no purple gradient, glass, generic hero, pills)

## Typography
- [x] Space Grotesk display + JetBrains Mono data (self-hosted @fontsource;
      no CDN — offline/hermetic builds preserved)
- [x] Scale 34/27(m)/15/13.5/12/10; micro-labels 10px mono uppercase ls .1em
- [x] tabular-nums on counts/durations/rates; display font on big KPIs

## Color
- [x] All colors via tokens; bar colors semantic (v2's 8-color palette removed)
- [x] Primary interactive = ink-on-dark button; green reserved for live/ok
- [x] Focus: 2px green ring, 2px offset, :focus-visible only
- [x] Contrast: ink #e8ebef on #0c0f13 passes; muted #9aa4af ≥4.5:1 for body

## Layout / density
- [x] 1040px container; split hero 1.45/1 collapses <780px; steps 3→1 <720px
- [x] Every section carries real data (spec rows list actual system facts;
      stats bars computed from store; "invented metrics: none" stated in UI)
- [x] Review rows wrap to single column on mobile; filter tabs wrap

## States
- [x] hover (border/lighten) on .btn/.navlink; disabled opacity .45
- [x] live dots get a green state ring (state, not decoration)

## Regression evidence (on real v3 sources)
- tsc clean; next build OK; fonts bundled into CSS chunk (verified @font-face)
- test_api 27/27 · routing 8/8 · audit 41 · slack 7 · mcp 18 · repo 143/143
- Live QA: topbar/spec-row/pipeline/step/colophon present in SSR HTML of `/`;
  "Protection model" spec on /login; hero on /stats; /review 307 unauth

## Incident during implementation (resolved)
- A tool-path quoting mistake initially wrote v3 files into a stray duplicate
  tree (a literal `"` directory) while the server kept serving the v2 build.
  Files were relocated to their real paths, stray tree removed, and the full
  regression + live QA were re-run against the genuine v3 sources.

## Known weaknesses / next
- Screenshot assets (docs/*.png) still show v1 — re-capture after deploy
- Dark theme screenshot legibility should be re-checked in demo.png re-shot
- n8n cloud demo still runs workflow v1 until user re-imports v2 export

## v4 audit notes (well off 2026-10-29)
- [x] No dark/terminal relics: grep for #0c0f13/#e8ebef cleared; glow rings
  removed from CSS; live dots are plain soft-green
- [x] .btn-solid re-added (was dropped in v3 css rewrite, used by ReviewActions)
- [x] Review FilterTab active label now white-on-ink (was near-black-on-ink)
- [x] Class-usage diff vs globals.css: no undefined classes referenced
- [x] Fonts verified in served CSS chunk (Manrope x-body, JetBrains, tokens)
- [x] Regression on final sources: tsc clean, build OK, test_api 27/27,
  routing 8/8, audit 41, slack 7, mcp 18, validate_repo 143/143
