# FeedbackOps AI — Design Contract (canonical visual rules)

**v4 — clean & soft light (2026-10-29)**

## Thesis

> FeedbackOps AI should feel like a **calm, well-made internal tool**: warm
> off-white surfaces, soft desaturated status colors, quiet typography, and
> generous-but-informative density. Professional and human — not a dark
> "hacker terminal" and not a loud SaaS template.

Evolution: v2 light paper (too plain) → v3 dark console (too "AI terminal")
→ **v4 clean & soft** (kept v3's rich information structure, calmed the skin).

## Typography

- **Manrope** 400–800, self-hosted via @fontsource — everything: headings
  (30px/800 hero, -0.02em), body 13.5px, UI.
- **JetBrains Mono** 400/600 — only for request IDs, machine metadata, and
  tabular numerals. NOT for labels or decoration.
- Micro-labels: 11px/600 uppercase sans, color faint, `ls .05em` (no mono).
- `tabular-nums` on counts/durations/rates.

## Color (soft, desaturated)

```
--bg #f7f6f3 (warm off-white)  --surface #ffffff  --surface-2 #f2f1ed
--border #e8e6e1  --border-strong #d8d5cf
--ink #24272b  --ink-hover #3a3e43  --muted #6b7178  --faint #989da3
--ok #3e8b62/--ok-bg #e9f2ec   --warn #a8802f/--warn-bg #f8f1e0
--err #ba5c5c/--err-bg #f8eded  --info #587fae/--info-bg #edf1f6
--track #e6e4de
```

Status colors are tints-on-light (soft sage / amber / rose / steel blue).
No neon, no glow. Primary button = warm ink. Cards carry the faintest single
shadow (`0 1px 2px rgba(28,32,30,.04)`) — softness, not decoration.

## Shape / depth

Radius: card 12 · control 8 · chip 6 (softest accents). 1px borders. No
Glassmorphism, no pills, no hover-lift.

## Layout / density (kept from v3, informally calm)

Container 1040px; split hero 1.45/1 (<780px stacks); console topbar (sans
wordmark + soft tag + ghost nav); hero band; workflow spec key/values; quiet
pipeline line (plain dots, no rings/glow); numbered steps; colophon. Every
section still carries real system facts — the richness lives in content,
not chrome.

## Anti-patterns (blocked)

Neon/glow/terminal aesthetics · mono-uppercase everywhere · purple gradient ·
dark theme · pills · shadows beyond the 1px soft one · fake metrics (stats
computed from store only).

## Pages

Same structure as v3: `/` hero·spec·pipeline → input → scenarios → result
ledger → steps → colophon; `/review` hero+session → KPI tiles → filters →
ledger rows; `/stats` hero(+"invented metrics: none") → volume → semantic
distributions → service KPIs; `/login` hero+protection model → form.
