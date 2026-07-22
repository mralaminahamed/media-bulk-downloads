# Recon + CDN-rule + API cheatsheet (self-contained)

Everything to decide build-or-close and to wire the simplest fix, without external
docs. Source of truth: `packages/core/src/collection/imageUrl.ts`,
`resolvers/network.ts`, `net/`, `download/stream/ssrf-guard.ts`.

## Recon-probe recipe (do this BEFORE writing anything)

```bash
UA='Mozilla/5.0 … Chrome/120 Safari/537.36'
# 1. pull a real public post/album page
curl -sL -A "$UA" --max-time 20 "<page-url>" -o /tmp/p.html -w 'http=%{http_code}\n'
# 2. extract the media CDN URLs it serves
grep -oE 'https://[^"'"'"' ]+\.(jpg|jpeg|png|webp|gif|mp4|m3u8)[^"'"'"' ]*' /tmp/p.html | sort -u | head
# 3. byte-compare the displayed variant vs a candidate bigger original
for U in "<thumb-url>" "<candidate-original>"; do
  curl -s -A "$UA" --max-time 20 -o /dev/null -w "%{http_code} %{size_download}  $U\n" "$U"
done
```

**Verdict rules:**
- No *reachable* file bigger than what the page shows → **close** (record in
  `docs/website/src/content/docs/benchmark/gaps.md` / `changelog.md`).
- Per-size **signed filenames** (each width has its own hash) → you can't rewrite a
  size; must read the widest listed (`srcset`) — a resolver, not a CDN rule.
- `bestSrcsetUrl` already returns the widest `srcset` entry and `upgradeToOriginal`
  covers 90+ families — if the page's largest listed rendition is the max, **generic
  already wins → close** (this is why Tumblr got no resolver).
- Signed / already-original URLs (Guardian `s=…`, 500px, `preview.redd.it`) → leave.

## Generic layer — `imageUrl.ts` helpers (exported)

`deproxy(url)` (unwrap Next.js `_next/image` / weserv / Cloudinary fetch) ·
`upgradeToOriginal(url)` (run the CDN rules) · `getImageType`/`detectType` ·
`parseUrlDimensions` · `looksLikeMediaUrl` · `parseSrcset`/`splitSrcsetCandidates`
(→ the widest is `bestSrcsetUrl` in `extract.ts`) · `isCloudinaryTransform`.

## Adding a host-agnostic CDN rule (the smallest fix)

A rule is `{ match, rewrite }` in the `RULES: CdnRule[]` array:

```ts
interface CdnRule { match: (u: URL) => boolean; rewrite: (u: URL) => void; }
```

- `match` — exact/suffix hostname check (never bare substring) + optional path shape.
- `rewrite` — mutate `u` **in place** to the original. Common helpers:
  `dropParams(u, RESIZE_PARAMS)` (RESIZE_PARAMS = `w h fit resize quality q dpr crop`,
  extend per site), or `u.pathname = u.pathname.replace(/…/, '…')` for a path token.
- **Curl-verify** the rewrite returns 200 + more bytes before adding it. A rule that
  404s or downgrades is worse than nothing.

## URL API essentials (used everywhere)

`new URL(raw)` throws on invalid → wrap in try/catch, return `null`. Read
`u.protocol` (require `'https:'`), `u.hostname` (exact `===`), `u.pathname`,
`u.searchParams` (`.get`/`.delete`/`.set`). Build ids into paths only after
`encodeURIComponent` + a shape check (`/^[a-z0-9]+$/i`).

## `srcset` parsing

`parseSrcset(ss)` → candidate URL list; a `srcset` entry is `<url> <descriptor>`
(`480w` width or `2x` density), comma-separated (URLs may contain commas — the
parser handles it). Read `srcset` / `data-srcset` / `data-lazy-srcset`; for a
`<picture>`, also scan its `<source>`s (`el.closest('picture').querySelectorAll('source,img')`).

## Host-pinning + SSRF (the Phase-2 network tier, `resolvers/network.ts`)

Any URL pulled from a **fetched** response is untrusted:

- **Host-pin**: require `https:` and hostname `=== / endsWith` the expected family
  (the `pinnedUrl(url, 'host.com')` pattern). Anything else → `null`.
- **Host-agnostic media** (Bluesky blob, PeerTube, gallery-page scrape) can't name a
  fixed host → require `https:` **plus** `isSafeCaptureUrl()`
  (`download/stream/ssrf-guard.ts`): rejects internal / loopback / link-local /
  cloud-metadata targets, on **both** the request host and the returned media URL.
- Strip tokens from anything logged with `stripUrlSecrets()` (`net/url-secrets.ts`).
- Add the platform to `ResolvePlatform` (`packages/core/src/types.ts`) when you add a
  `network.ts` case; the fetch runs in the background worker, opt-in only.

## Sniffers (MAIN-world, for media the DOM never carries)

When a page fetches its media JSON/manifest over XHR/`fetch` (Instagram/Facebook
GraphQL, `.m3u8`), a MAIN-world sniffer entrypoint
(`entrypoints/<x>-media-sniffer.content.ts`) wraps `fetch`/XHR, extracts URLs via
`resolvers/sniffers/*`, and `postMessage`s them to the content-script relay
(`source: 'mbd-<x>-media'`). The relay validates `data.source` and re-pins. Match
the discriminator on **both** ends. Observe URLs only — never response bodies for
capture; forge no requests.
