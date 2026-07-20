# Tokens, component classes & Tailwind-v4 rules (self-contained)

Everything needed to style the popup/bubble without leaving the repo. Source of
truth: `apps/extension/src/styles/index.css`. External docs are optional further
reading only.

## The `mbd:` prefix (non-negotiable)

`index.css` does `@import "tailwindcss" prefix(mbd);`. **Every Tailwind utility
must be written `mbd:…`** — `mbd:flex`, `mbd:items-center`, `mbd:bg-(--panel)`,
`mbd:hover:bg-(--panel-2)`, `mbd:-mt-1`, `mbd:group-hover:opacity-100`. A **bare**
utility (`flex`) generates **no CSS** — silent no-op. The prefix goes first, before
variants and before a negative sign. The `group` marker is `mbd:group`.

Component classes (below) are hand-authored CSS in `index.css`, **not** utilities —
they stay **bare** (`class="btn"`, not `mbd:btn`). The `is-active` state class is bare.

## The cascade trap (real bugs)

Component classes are defined **after** `@import "tailwindcss"`, so a component
class **wins over an equal-specificity utility**. `class="field mbd:w-[120px]
mbd:h-[28px]"` renders full-width/34px because `.field { width:100%; height:34px }`
wins. **Fix:** set the exact size with inline `style={{ height:28, width:120 }}`
(wins on specificity), or drop the component class. Utilities only win over classes
that don't set that property (`.segwrap` has no width/height → `mbd:w-[204px]` works).

## Design tokens (CSS variables on `:root, :host`, dark override via `@media`)

Use these; never hardcode. Values shown light → dark.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` / `--panel` / `--panel-2` | #fff / #f7f7fa / #f0f0f4 | #0e0f13 / #16181e / #1e2029 | surfaces (base → lifted) |
| `--ink` / `--ink-2` / `--ink-3` | #17181c / #5f616c / #9a9ca6 | #e9eaef / #a4a6b2 / #6d6f7c | text (body / data / decorative-only) |
| `--line` / `--line-strong` | #ececf1 / #dedde5 | #23252e / #33353f | hairlines / stronger borders |
| `--brand` / `--brand-ink` / `--brand-soft` / `--ring` | #6366f1 / #4f46e5 / #eef0fe / rgba(99,102,241,.35) | #818cf8 / #6366f1 / #1c1b39 / … | single indigo accent |
| `--warn` | #b45309 | #fbbf24 | errors (semantic, off the accent) |
| `--donate` / `--donate-ink` / `--donate-soft` | #e11d48 / #be123c / #ffe4e6 | #fb7185 / #fda4af / #3f1d2b | warm rose, off the ramp — donate control |
| `--overlay` / `--scrim` | dark washes (theme-independent) | — | modal scrim / thumbnail hover |
| `--ctl-ring` | rgba(0,0,0,.06) | rgba(255,255,255,.12) | edges on floating controls (flips by theme) |
| `--radius-lg` / `--radius` / `--radius-sm` / `--radius-xs` | 12 / 10 / 7 / 5 px | same | corner scale |

**Scrims never derive from `--ink`** (it inverts by theme and would whiten a scrim
in dark mode). There is **no `--radius-md`** — the "md" tier is bare `--radius`
(10px); write `mbd:rounded-(--radius)`, never `mbd:rounded-md` (Tailwind's 6px).

## Component classes (all bare; `index.css`)

`.mbd-app` (root surface) · `.btn` (38h) / `.btn-sm` (30h) / `.btn-primary` /
`.btn-ghost` / `.btn-group` · `.iconbtn` (32²) / `.iconbtn-sm` (28²) · `.donatebtn`
(32² rose pill, filled `--donate-soft` + solid heart) · `.field` (34h inputs/selects)
· `.chip` (27h filter) · `.seg` (23h) in `.segwrap` (`.segwrap-even` + fixed width =
equal columns) · `.switch` (toggle) · `.card` · `.countpill` · `.num` (tabular mono)
· `.eyebrow` (mono micro-label) · `.hairline` (border) · `.dotgrid` (header texture)
· `.checker` (transparency backdrop) · `.skeleton` + `.shimmer` · `.scroll-thin` ·
`.reveal` / `.overlay-in` / `.sheet-in` / `.progress-indet` (entrance/loading anim).

**Heights for one-line alignment:** btn 38 · btn-sm 30 · iconbtn/donatebtn 32 ·
iconbtn-sm 28 · field 34 · chip 27 · seg 23. Mixing → normalize with inline height.

## Tailwind v4 shorthand (write token utilities this way)

- Colors: `mbd:bg-(--panel)`, `mbd:text-(--ink-2)`, `mbd:ring-(--ctl-ring)` — **not**
  `bg-[var(--panel)]`. Opacity: `mbd:bg-(--panel)/85` (emits `color-mix`).
- Radius: named `mbd:rounded-lg` / `-sm` / `-xs` (map to `--radius-*`, this repo's
  12/7/5); the md tier is `mbd:rounded-(--radius)`.
- Spacing: prefer the scale where it maps (`mbd:h-4.5` = 18px, `mbd:h-7` = 28px);
  keep bespoke layout widths arbitrary (`mbd:w-[380px]`).
- CSS-in-JS + SVG attrs keep real `var(--…)` (see `bubble/Bubble.tsx`).

## Motion (keyframes in `index.css`)

`donate-beat` · `reveal` · `overlay-in` · `sheet-in` · `spin` · `progress-slide` ·
`shimmer`. **Honor `prefers-reduced-motion`:** gate perpetual/looping animation
behind `@media (prefers-reduced-motion: no-preference)`, keep the static style as
fallback (e.g. `.donatebtn`'s heartbeat drops; the rose pill stays).

## Modals

`role="dialog"` + `aria-modal` + the shared `useDialog` hook
(`popup/hooks/useDialog.ts`): focus trap, Escape, focus restore. Scrim uses
`mbd:bg-(--overlay)`.
