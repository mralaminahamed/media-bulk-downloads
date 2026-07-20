# Worked example — a DOM-`srcset`-widest resolver (Der Spiegel)

The full source is `packages/core/src/resolvers/sites/spiegel.ts` (~70 lines) and
its test `packages/core/tests/resolvers/sites/spiegel.test.ts`. This walks through
*why each piece is shaped that way* — the pattern to copy when a CDN signs each
width separately (so you can't rewrite a dimension) but the page lists several sizes.

## The situation (from recon)

Der Spiegel serves one photo under a `<uuid>` at many widths/crops as **separate
filenames** on `cdn.prod.www.spiegel.de`
(`/images/<uuid>_w1280_r1.33_….webp`). The displayed `<img src>` is a *small* width;
the larger ones live in the element's `srcset` (and the `<picture>`'s `<source>`s).
A fixed-width rewrite 404s (max width is per-image bounded). So the only safe
upgrade is: **read the widest same-`<uuid>` rendition the page already lists.**

## The pieces

**1. A host + path matcher, and a strict parser.**

```ts
const SPIEGEL_HOST = 'cdn.prod.www.spiegel.de';
const SPIEGEL_IMG  = /^\/images\/([0-9a-f-]{36})_w(\d+)_r([\d.]+)_/i;   // captures uuid, width, ratio
```

`parseSpiegel(raw)` returns `{ url, uuid, width, ratio }` **only** for an
`https:` URL on the exact host whose path matches — anything else → `null`. Every
URL (the input and each `srcset` candidate) goes through it, so a page-controlled
value can never inject a bad host/scheme. Shape-validation is not optional.

**2. `match` gates cheaply, `resolve` does the work.**

```ts
match: (u) => u.hostname === SPIEGEL_HOST && SPIEGEL_IMG.test(u.pathname),
```

Exact `===` hostname (never substring). `hosts: ['spiegel.de']` buckets it in the
registry's host index so it's only tried on Spiegel URLs (see "the contract" below).

**3. `resolve` reads the widest same-image rendition off `ctx.el`.**

- Parse the collected URL. If `ctx.el` exists, find its `closest('picture')` and
  scan every `<source>`/`<img>`'s `srcset` / `data-srcset` / `data-lazy-srcset` with
  `parseSrcset()`.
- Keep the candidate with the **same `uuid`** and the **largest `width`** — start
  from the input, only ever move up. Never fabricate a width (it would 404).
- Return one `MediaCandidate`: `url` = widest, `kind: 'image'`, `width`, `height`
  (from `ratio`), `ext`, and — crucially — `mediaKey: 'spiegel <uuid>'` so all the
  widths **fold to one row** across scans/tabs. Set `thumbnailSrc` to the original
  `src` only when you actually upgraded.

## Registering + testing

- Add to `resolvers/index.ts` `REGISTRY` **before `genericResolver`**.
- Test by calling `spiegelResolver.resolve(new URL(src), { el, allowNetwork:false })`
  directly with a fabricated `<picture>`/`<img srcset>` DOM (jsdom) — assert it
  returns the widest URL, the `mediaKey`, and that a non-Spiegel URL returns `[]`.
  Add a collection-wiring test in
  `apps/extension/tests/unit/extension/content/collect.test.ts`.

## When to copy this vs. something else

- **This (DOM-`srcset`-widest):** per-size signed filenames, page lists sizes.
  Also: Onedio (`sites/onedio.ts`).
- **A CDN rule in `imageUrl.ts`:** a plain path/param rewrite curl-verifies bigger
  (no DOM needed).
- **A page-JSON reader:** the originals live in embedded JSON (`__NEXT_DATA__`,
  `window.postDataJSON`, …) — read same-origin in the content script.
- **Phase-2 network (`resolvers/network.ts`):** the original needs a fetch to a host
  API — opt-in, host-pinned, add the platform to `ResolvePlatform`.
