---
title: "Resolver candidates"
---

> Part of the [Collection Benchmark](./overview.md). Tracks sites **not yet
> supported** that are worth a resolver, with a validated live status and the
> recon verdict. Feeds `/resolver:recon` and `/resolver:add`. Complements
> [gaps.md](./gaps.md) (open, *unupgradeable*) and [changelog.md](./changelog.md)
> (shipped/closed).

Discovery cross-referenced against [gallery-dl](https://github.com/mikf/gallery-dl)'s supported-sites list (used as a **factual reference only** — endpoints / URL shapes; GPL, no source copied).
Reachability + markup-readiness validated by HTTP probe (status + byte size: a large `200` = server-rendered markup a resolver/DOM read can use; a `403` ~5.5 KB "Just a moment" = Cloudflare-gated →
needs an in-browser recon;
`000` = down). Last validated: **2026-07-21**.

## GitHub issue sweep (2026-07-21) — the 5 open resolver issues (excl. AI #202 / cloud-sync #203)

Read, validated live, and resolved every open resolver issue:

- ✅ **#375 Odnoklassniki (ok.ru)** — shipped. Network-free `okruPageMedia` reads the player
  `data-options` JSON → highest progressive MP4 on `*.okcdn.ru` (generic misses the JSON blob).
- ✅ **#400 Kick** — shipped. Network-tier resolver mirroring Twitch (clip `.../play` mp4, VOD
  `source` HLS), host-pinned to `*.kick.com`. Runtime-gated by Kick's CF (fetch runs in the user's browser); unit-tested + fail-closed.
- ✅ **#372 VK** — shipped as a CDN `cs=` drop (see table below; the signature blocker is now cleared).
- ✔ **#401 Snapchat Spotlight** — **closed as already generic-covered.** The runtime `<video>`
  exposes the real `.27.` mp4 in `src`/`<source type=video/mp4>` on `sc-cdn.net` with the `.256.`
  poster — the generic collector captures it (verified live: passes every `collectAv` gate). A resolver would return the identical URL (deduped). The `__NEXT_DATA__` feed is intentionally not pulled
  (over-collection).
- ✔ **#387 ShareChat** — **closed as generic-covered / no upgrade path.** Post images are `_sc.webp`
  surfaced via `og:image` + `<img>` on the sharechat CDNs (generic collects them). The proposed
  `_thumbnail_v2` strip is a dead end (byte-verified: `_sc_thumbnail_v2.jpeg` 200 → stripped 404), and the full image has a different hash than the grid thumbnail, so no deterministic rewrite.

## Session triage (2026-07-21) — what shipped, what's gated

A build sweep this session harvested every candidate whose mechanism could be **curl/byte-verified from a headless environment** (CDN size rules + one open-API size folder) — all shipped, all
live-verified:

- ✅ **MangaDex** (MAIN-world sniffer of the open `at-home` API — new manga category)
- ✅ **Steam UGC**, ✅ **WikiArt**, ✅ **Inkbunny**, ✅ **Itaku** (CDN rules; byte-verified 2–17×)

**Already covered by the generic pipeline — no per-site code needed (validated live).**
The most important validation finding of the sweep: the **plain-`<img>` reader class**
(most manga readers, most image galleries) is **already fully collected by the generic
`collectMedia()` + deep-scan** — these sites mount every page/scan as a real `<img src="…">`
on a plain CDN (the src is the original), which the generic collector reads directly and deep-scan surfaces for paginated ones. A **dedicated resolver is only warranted for SPAs that hide the original
behind canvas/blob/JS** (MangaDex-style), which is exactly why MangaDex needed a sniffer and weebcentral does not.

- **weebcentral** — live-proved 2026-07-21 in the automation browser (no CF wall): a chapter mounts all **21 page originals** as `<img src="scans.lastation.us/manga/<slug>/<n>.png">`
  (plain, no query, `src` present pre-scroll). `collectMedia()` collects every one with **zero per-site code** → **covered, no build**. The rest of the manga family (`mangakakalot`/`manganato`·
  `natomanga`/`rawkuma`/`fanfox`) is the same plain-`<img>` reader class → covered at runtime (natomanga CF-walls the *automation* browser on deep hops, but the real user's browser passes and the
  generic collector still reads the mounted `<img>` srcs).

**Genuinely need a resolver AND a live user session to build (Phase 2 — not headless-verifiable):**
only the *originals-hidden / signed / login* sites remain:

- **Signed / login sample needed:** VK (signed URLs), Bunkr + balbums.st (signed `scdn.st` CDN), the XenForo forums (`simpcity`/`titsintops`/`socialmediagirls`), and the **NEEDS_BROWSER** list.
- **CF-gated content pages that hide originals** (a resolver *might* help if the on-page image is a downscaled preview, not the original): `whyp.it`, `webmshare`, `nsfwalbum`, hentai galleries.
  Confirm-in-browser whether the mounted media is already the original (→ generic covers it) before building.
- **Niche readers needing a content URL** (no public index to sample): `soundgasm`, `poipiku`,
  `eporner` (API returns an embed, not a direct mp4).

None are closed. For the plain-`<img>` class, **nothing to build — the extension already handles them**. For the signed/hidden-original class, hand over one sample content URL and it gets built.

## Confirmed BUILD — recon'd, mechanism verified

| Site                    | Type             | Mechanism                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|-------------------------|------------------|----------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **VK** ✅ shipped       | CDN rule         | `*.userapi.com` `/s/v<n>/ig<n>/…&cs=WxH` → drop `cs=` (keep `u=` token)          | **SHIPPED 2026-07-21 (#372).** The signature blocker is cleared: verified live via in-page `Image()` loads that removing/raising `cs` on a signed `ig` URL still serves the image (no 403/404) → `cs` sits **outside** the `u=` signature. Rule drops `cs`, scoped to the signed `ig` photo path. The full-size viewer is login-walled for anon, so the win magnitude on a large original isn't byte-proven headless (follows VK's documented `cs`-cap semantics; never downgrades) |
| **Bunkr**               | resolver (album) | `/a/<id>`→`/f/<slug>`→`dl.bunkr/api/_001_v2`→sign→original (per-file media host) | thumb 147 KB → 19 MB; live (200)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Pixeldrain**          | resolver         | `/l/<id>` → `/api/list/<id>` → `/api/file/<id>` originals                        | API contract confirmed (SPA shell)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **turbo.cr** (ex-Saint) | resolver         | video id → site's own `GET /api/sign?v=<id>` → signed `dl*.turbocdn.st` mp4      | live (200); signed short-TTL → resolve at download                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Conditional BUILD — in-scope path only

| Site       | Safe mechanism                                                                                                                          | Constraint                                                                                                                              |
|------------|-----------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| **Gofile** | read the page's own `window.appdata…children[].link` (store*.gofile.io originals); downloads inherit the site-set `accountToken` cookie | **no** anti-bot token reverse-engineering; homepage curl-blocked but API live; needs in-browser confirm anon guest gets non-empty links |

## Live + server-rendered — recon-ready (validated 200)

Rule of thumb: these render usable markup to an anonymous request, so a DOM / page-JSON reader is viable; confirm exact selectors with `/resolver:recon`.

- **Manga** (whole category, zero coverage): `fanfox.net`, `mangatown.com`,
  `manganato.gg`, `rawkuma.net`, `weebcentral.com`; hentai galleries share a template: `imhentai.xxx`, `hentaifox.com`, `hentai2read.com`.
- **Album / file hosts** (erome/imgchest reader pattern): `cyberfile.me`,
  `nsfwalbum.com`, `webmshare.com`, `filester.me`.
- **Single-image hosts** (extend `imagehosts.ts`): `imx.to`, `imageshack.com`,
  `vipr.im`. (`acidimg.cc` returns a tiny interstitial — recon before trusting.)
- **Media forums** (one XenForo-family reader ≈ all): `simpcity.cr`,
  `titsintops.com`, `forums.socialmediagirls.com`.
- **Art / audio**: ~~`inkbunny.net`~~ (✅ shipped 2026-07-21 — `/files/screen/`→`/full/` CDN rule), ~~`itaku.ee`~~ (✅ shipped 2026-07-21 — nested `_size` collapse CDN rule), `poipiku.com`, ~~
  `wikiart.org`~~ (✅ shipped 2026-07-21 — `!SizeCode` strip CDN rule), `soundgasm.net`, `whyp.it` (CF-gated).
- **Video / galleries**: `eporner.com` (public API), ~~`pornpics.com`~~ (✅ shipped 2026-07-21 — `cdni.pornpics.com` `/460/`→`/1280/` size-segment CDN rule),
  `fitnakedgirls.com`, `fikfap.com`.

## NEEDS_BROWSER — reachable but Cloudflare / JS-gated (403 or JS shell)

Confirm markup + mechanism in a live tab (Claude-in-Chrome) before building:
`furaffinity.net`, `nhentai.net`, `luscious.net`, `nudostar.tv`, `newgrounds.com`,
`toyhou.se`, `weasyl.com`, `mangafire.to`, `comick.io`, `piczel.tv`, `nijie.info`,
`webtoons.com`, `vipergirls.to`, `pictoa.com`. **Bandcamp** (audio) also sits here. (**Kick** — ✅ shipped 2026-07-21 (#400); the CF-gated fetch runs in the user's browser at runtime.)

## CLOSED / SKIP

- **Cyberdrop** — DOWN (dead zone: NS on Cloudflare, zero A records; alt TLDs are parking). The [CyberDropMe-dl](https://github.com/magnusjwatson2786/CyberDropMe-dl)
  reference (MIT) targets this defunct domain; its album-scrape shape informs a future rebuild if the origin returns.
- **mangapark.net** — unreachable (000) at validation; recheck later.
- **Tumblr** — generic `bestSrcsetUrl` already takes the CDN-cap original.
- **Kick** — ✅ shipped 2026-07-21 (#400) as a network-tier resolver mirroring Twitch (clip
  `.../play` mp4, VOD `source` HLS, host-pinned `*.kick.com`). Cloudflare JA3-gates anonymous headless API requests, so the fetch runs in the user's browser at capture time; unit-tested + fail-closed.

## Already covered — do NOT rebuild

Host-agnostic rules already catch several gallery-dl entries: Mastodon instances (`pawoo`, `baraag`) → `mastodon.ts`; 4chan archives (`archived.moe`, `fireden`,
`b4k`, …) → `foolfuuka.ts`; Chevereto (`jpg*`, `putmega`) → `chevereto.ts`; MediaWiki/Fandom wikis → the Wikipedia `/thumb/` rule; Danbooru/Gelbooru/Moebooru clones → `booru.ts`. CDN rules cover
LOFTER (`imglf`), Naver (`pstatic`), Weibo images (`sinaimg`), Bilibili images (`hdslb`), ImgBB (`ibb`), Catbox (free-ride), Blogspot, Giphy, VSCO, Misskey, DeviantArt (wixmp). `500px` is closed
(signed).

## Highest-leverage next builds

- ✅ **MangaDex — SHIPPED 2026-07-21.** Anchored the new *manga* category via a MAIN-world sniffer of its open `at-home/server` API (see [changelog](./changelog.md)).
- ✅ **Steam UGC — SHIPPED 2026-07-21.** CDN rule stripping the unsigned resize query on `images.steamusercontent.com/ugc/` (see [changelog](./changelog.md)).

1. **Bunkr** — live album reader (proven pattern).
2. ~~**VK**~~ — ✅ shipped 2026-07-21 (#372): `cs=` drop CDN rule (signature blocker cleared).
3. A **XenForo forum reader** (covers simpcity/titsintops/socialmediagirls at once)
   and a **hentai-gallery template** (imhentai/hentaifox family) — high fan-out.
