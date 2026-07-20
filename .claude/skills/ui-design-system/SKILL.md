---
name: ui-design-system
description: Style the popup / on-page bubble consistently using this repo's "precision-utility" design system (tokens, component classes, radius/height scale, dark mode). Use when editing any React component under apps/extension/src/extension/popup or apps/extension/src/extension/bubble, adding UI, changing colors/spacing/sizing, or when a height/width/color class "isn't applying".
---

# UI design system ("precision utility")

Tokens and component classes live in `apps/extension/src/styles/index.css`. Tailwind v4 utilities
are available; theme values are CSS variables on `:root, :host` (also inside the
bubble's Shadow DOM), with a `@media (prefers-color-scheme: dark)` override.

## ⚠️ Every Tailwind utility is prefixed `mbd:`

`index.css` imports Tailwind with a prefix: `@import "tailwindcss" prefix(mbd);`.
So **every utility class must be written `mbd:…`** — `mbd:flex`, `mbd:items-center`,
`mbd:bg-(--panel)`, `mbd:hover:bg-(--panel-2)`, `mbd:-ml-1`, `mbd:group-hover:opacity-100`.
A **bare** utility (`flex`, `bg-(--panel)`) generates **no CSS** — Tailwind only
scans for the prefixed form, so a bare class is a silent no-op. The prefix goes at
the very front, before variants and before a negative sign (`mbd:hover:…`,
`mbd:-mt-1`).

What stays **bare** (author CSS in `index.css`, not utilities — the prefix does not
apply): the component classes below (`.btn`, `.btn-sm`, `.iconbtn`, `.iconbtn-sm`,
`.donatebtn`, `.chip`, `.field`, `.seg`, `.switch`, `.card`, `.num`, `.eyebrow`,
`.hairline`, `.dotgrid`, `.skeleton`, `.segwrap`, …),
the `is-active` state class, and the `group` marker is `mbd:group` (it anchors the
prefixed `mbd:group-hover:*` variants — write it prefixed too).

## ⚠️ The cascade trap (this has caused real bugs)

`index.css` defines component classes (`.field`, `.chip`, `.seg`, `.btn`, `.switch`)
**after** `@import "tailwindcss"`. So a component class **wins over an arbitrary
Tailwind utility of equal specificity**. Concretely:

- `.field` sets `width: 100%; height: 34px` → `class="field mbd:w-[120px] mbd:h-[28px]"`
  renders **full-width, 34px** (the utilities are overridden). Same for
  `.chip { height: 27px }` vs `mbd:h-[28px]`. (The `mbd:` prefix doesn't change
  specificity — `.mbd\:w-\[120px\]` is still one class selector, same weight as
  `.field`, and the later-defined component class wins.)

**Fix:** set the exact size with an **inline `style`** (highest priority), e.g.
`style={{ height: 28, width: 120 }}`, or restyle without the component class.
Utilities only "win" over classes that don't set that property (e.g. `.segwrap`
has no width/height, so `mbd:w-[204px] mbd:h-[28px]` work there).

## Tokens (use these, never hardcode)

- Surfaces: `--paper`, `--panel`, `--panel-2`. Text: `--ink`, `--ink-2` (data),
  `--ink-3` (decorative only — too faint for real text). Lines: `--line`,
  `--line-strong`.
- Accent (single indigo): `--brand`, `--brand-ink`, `--brand-soft`, `--ring`.
- Semantic: `--warn` (errors), and `--donate` / `--donate-ink` / `--donate-soft`
  (a warm rose, deliberately **off** the indigo ramp — the donate/support control)
  — both separate from the single accent. Both have a dark-mode override.
- Scrims (theme-independent dark washes — **never** derive from `--ink`, which
  inverts light↔dark and would whiten a scrim in dark mode): `--overlay` (modals),
  `--scrim` (thumbnail hover). `--ctl-ring` for edges on floating controls (flips
  black↔white by theme).
- Radius scale: `--radius-lg` 12 / `--radius` 10 / `--radius-sm` 7 / `--radius-xs` 5.

## Component heights (for aligning controls on one line)

`.btn` 38 · `.btn-sm` 30 · `.iconbtn` / `.donatebtn` 32 · `.iconbtn-sm` 28 ·
`.field` 34 · `.chip` 27 · `.seg` 23 (in a `.segwrap`). Mixing these on one row
looks uneven — normalize with inline height (see trap above).

`.donatebtn` is the highlighted rose pill (filled `--donate-soft` + solid heart)
that stands out from the monochrome `.iconbtn` row, vs `.iconbtn` (transparent 32²).

## Tailwind v4 shorthand (write token utilities this way)

Use the v4 CSS-variable **parens** shorthand, not the old bracket form (and every
utility carries the `mbd:` prefix — see the prefix section above):

- Colors/surfaces: `mbd:bg-(--panel)`, `mbd:text-(--ink-2)`, `mbd:ring-(--ctl-ring)` —
  **not** `bg-[var(--panel)]`. Both compile to `background-color: var(--panel)`;
  the parens form is the current idiom.
- Opacity: `mbd:bg-(--panel)/85` (v4 emits a `color-mix`, faithful).
- Radius — prefer the **named** utilities `mbd:rounded-lg` / `mbd:rounded-sm` /
  `mbd:rounded-xs`. They emit `var(--radius-lg|sm|xs)`, and this repo overrides those
  on `:root`, so they render **12 / 7 / 5 px** (this repo's scale), not Tailwind's
  defaults.
- ⚠️ **Radius trap:** the "md" tier token is bare **`--radius`** (10px) and there
  is **no `--radius-md`**. Write `mbd:rounded-(--radius)` — **never `mbd:rounded-md`**,
  which maps to Tailwind's default `--radius-md` (6px): a silent size change.
- Spacing: prefer the scale over arbitrary px where it maps cleanly
  (`mbd:h-[18px]` → `mbd:h-4.5`, `mbd:h-[28px]` → `mbd:h-7`). Keep genuinely bespoke
  layout widths (e.g. `mbd:w-[380px]`) as arbitrary — px is the clearer intent there.
- This shorthand is for Tailwind **class strings only**. CSS-in-JS
  (`style={{ background: 'var(--panel)' }}`) and SVG attributes keep real
  `var(--…)` — see `apps/extension/src/extension/bubble/Bubble.tsx`.

## Patterns

- Signature bits: `.eyebrow` (mono micro-label), `.num` (tabular mono numerals),
  `.hairline` borders, `.dotgrid` header texture, `.segwrap` / `.seg` segmented
  control (add `.segwrap-even` + a fixed width for equal columns).
- Modals: `role="dialog"` + `aria-modal` + the shared `useDialog` hook
  (`popup/hooks/useDialog.ts`) for focus trap, Escape, focus restore. Scrim uses
  `mbd:bg-(--overlay)`.
- Respect both themes; the tokens do the work if you use them.
- **Honor `prefers-reduced-motion`.** Gate any perpetual/looping animation behind
  `@media (prefers-reduced-motion: no-preference)` and keep the static styling as
  the fallback (e.g. `.donatebtn`'s heartbeat drops, the rose pill stays).

## References

- Design tokens + component classes (this repo) — `apps/extension/src/styles/index.css`
- Surfaces that consume them (this repo) — `apps/extension/src/extension/popup/`,
  `.../bubble/` (Shadow DOM), `.../components/BrandMark.tsx`
- Bubble surface guide (this repo) — `docs/guides/bubble.md` (Shadow-DOM host, backdrop)
- Tailwind CSS v4 — https://tailwindcss.com/docs
- `prefers-reduced-motion` — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- CSS `@keyframes` / `animation` — https://developer.mozilla.org/en-US/docs/Web/CSS/animation
- CSS custom properties (the token layer) — https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
- Tailwind v4 CSS-variable shorthand & arbitrary values — https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values
- Tailwind v4 theme variables (how `rounded-*` maps to `--radius-*`) — https://tailwindcss.com/docs/theme
- CSS cascade & specificity (why component classes win) — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Specificity
- `prefers-color-scheme` (dark mode) — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
- ARIA dialog pattern — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Shadow DOM (the on-page bubble) — https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM
