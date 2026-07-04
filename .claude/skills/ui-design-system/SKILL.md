---
name: ui-design-system
description: Style the popup / on-page bubble consistently using this repo's "precision-utility" design system (tokens, component classes, radius/height scale, dark mode). Use when editing any React component under src/extension/popup or src/extension/bubble, adding UI, changing colors/spacing/sizing, or when a height/width/color class "isn't applying".
---

# UI design system ("precision utility")

Tokens and component classes live in `src/styles/index.css`. Tailwind v4 utilities
are available; theme values are CSS variables on `:root, :host` (also inside the
bubble's Shadow DOM), with a `@media (prefers-color-scheme: dark)` override.

## ⚠️ The cascade trap (this has caused real bugs)

`index.css` defines component classes (`.field`, `.chip`, `.seg`, `.btn`, `.switch`)
**after** `@import "tailwindcss"`. So a component class **wins over an arbitrary
Tailwind utility of equal specificity**. Concretely:

- `.field` sets `width: 100%; height: 34px` → `class="field w-[120px] h-[28px]"`
  renders **full-width, 34px** (the utilities are overridden). Same for
  `.chip { height: 27px }` vs `h-[28px]`.

**Fix:** set the exact size with an **inline `style`** (highest priority), e.g.
`style={{ height: 28, width: 120 }}`, or restyle without the component class.
Utilities only "win" over classes that don't set that property (e.g. `.segwrap`
has no width/height, so `w-[204px] h-[28px]` work there).

## Tokens (use these, never hardcode)

- Surfaces: `--paper`, `--panel`, `--panel-2`. Text: `--ink`, `--ink-2` (data),
  `--ink-3` (decorative only — too faint for real text). Lines: `--line`,
  `--line-strong`.
- Accent (single indigo): `--brand`, `--brand-ink`, `--brand-soft`, `--ring`.
- Semantic: `--warn` (errors) — separate from the accent.
- Scrims (theme-independent dark washes — **never** derive from `--ink`, which
  inverts light↔dark and would whiten a scrim in dark mode): `--overlay` (modals),
  `--scrim` (thumbnail hover). `--ctl-ring` for edges on floating controls (flips
  black↔white by theme).
- Radius scale: `--radius-lg` 12 / `--radius` 10 / `--radius-sm` 7 / `--radius-xs` 5.

## Component heights (for aligning controls on one line)

`.btn` 38 · `.btn-sm` 30 · `.field` 34 · `.chip` 27 · `.seg` 23 (in a `.segwrap`).
Mixing these on one row looks uneven — normalize with inline height (see trap above).

## Patterns

- Signature bits: `.eyebrow` (mono micro-label), `.num` (tabular mono numerals),
  `.hairline` borders, `.dotgrid` header texture, `.segwrap` / `.seg` segmented
  control (add `.segwrap-even` + a fixed width for equal columns).
- Modals: `role="dialog"` + `aria-modal` + the shared `useDialog` hook
  (`popup/hooks/useDialog.ts`) for focus trap, Escape, focus restore. Scrim uses
  `bg-[var(--overlay)]`.
- Respect both themes; the tokens do the work if you use them.

## References

- Design tokens + component classes (this repo) — `src/styles/index.css`
- Tailwind CSS v4 — https://tailwindcss.com/docs
- CSS cascade & specificity (why component classes win) — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Specificity
- `prefers-color-scheme` (dark mode) — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
- ARIA dialog pattern — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Shadow DOM (the on-page bubble) — https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM
