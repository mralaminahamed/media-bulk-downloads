# Resolver candidates

> Part of the [Collection Benchmark](../BENCHMARK.md). Tracks sites **not yet
> supported** that are worth a resolver, with a validated live status and the
> recon verdict. Feeds `/resolver:recon` and `/resolver:add`. Complements
> [gaps.md](./gaps.md) (open, *unupgradeable*) and [changelog.md](./changelog.md)
> (shipped/closed).

Discovery cross-referenced against [gallery-dl](https://github.com/mikf/gallery-dl)'s supported-sites list (used as a **factual reference only** — endpoints / URL shapes; GPL, no source copied).
Reachability + markup-readiness validated by HTTP probe (status + byte size: a large `200` = server-rendered markup a resolver/DOM read can use; a `403` ~5.5 KB "Just a moment" = Cloudflare-gated →
needs an in-browser recon;
`000` = down). Last validated: **2026-07-21**.

## Confirmed BUILD — recon'd, mechanism verified

| Site                    | Type               | Mechanism                                                                                                      | Evidence                                           |
|-------------------------|--------------------|----------------------------------------------------------------------------------------------------------------|----------------------------------------------------|
| **VK**                  | CDN rule           | `*.userapi.com` `/s/v1/ig2/…&cs=WxH` → drop `cs=` (keep `u=` token)                                            | cs=640 71 KB → stripped 681 KB (~10–190×)          |
| **Steam**               | CDN rule           | `images.steamusercontent.com/ugc/…?imw=…` → strip query                                                        | 29 KB → 135 KB (4.7×)                              |
| **MangaDex**            | resolver (Phase-2) | `mangadex.org/chapter/<id>` → `api.mangadex.org/at-home/server/<id>` → `<baseUrl>/data/<hash>/<file>` per page | data/ 9× data-saver/; open API                     |
| **Bunkr**               | resolver (album)   | `/a/<id>`→`/f/<slug>`→`dl.bunkr/api/_001_v2`→sign→original (per-file media host)                               | thumb 147 KB → 19 MB; live (200)                   |
| **Pixeldrain**          | resolver           | `/l/<id>` → `/api/list/<id>` → `/api/file/<id>` originals                                                      | API contract confirmed (SPA shell)                 |
| **turbo.cr** (ex-Saint) | resolver           | video id → site's own `GET /api/sign?v=<id>` → signed `dl*.turbocdn.st` mp4                                    | live (200); signed short-TTL → resolve at download |

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
- **Art / audio**: `inkbunny.net` (open API — easy), `itaku.ee`, `poipiku.com`,
  `wikiart.org`, `soundgasm.net`, `whyp.it`.
- **Video / galleries**: `eporner.com` (public API), `pornpics.com`,
  `fitnakedgirls.com`, `fikfap.com`.

## NEEDS_BROWSER — reachable but Cloudflare / JS-gated (403 or JS shell)

Confirm markup + mechanism in a live tab (Claude-in-Chrome) before building:
`furaffinity.net`, `nhentai.net`, `luscious.net`, `nudostar.tv`, `newgrounds.com`,
`toyhou.se`, `weasyl.com`, `mangafire.to`, `comick.io`, `piczel.tv`, `nijie.info`,
`webtoons.com`, `vipergirls.to`, `pictoa.com`. **Bandcamp** (audio) and **Kick**
(cookie-bound) also sit here.

## CLOSED / SKIP

- **Cyberdrop** — DOWN (dead zone: NS on Cloudflare, zero A records; alt TLDs are parking). The [CyberDropMe-dl](https://github.com/magnusjwatson2786/CyberDropMe-dl)
  reference (MIT) targets this defunct domain; its album-scrape shape informs a future rebuild if the origin returns.
- **mangapark.net** — unreachable (000) at validation; recheck later.
- **Tumblr** — generic `bestSrcsetUrl` already takes the CDN-cap original.
- **Kick** — Cloudflare JA3-gated; only a cookie-bound Tier-2 fetch possible (unverifiable anonymously).

## Already covered — do NOT rebuild

Host-agnostic rules already catch several gallery-dl entries: Mastodon instances (`pawoo`, `baraag`) → `mastodon.ts`; 4chan archives (`archived.moe`, `fireden`,
`b4k`, …) → `foolfuuka.ts`; Chevereto (`jpg*`, `putmega`) → `chevereto.ts`; MediaWiki/Fandom wikis → the Wikipedia `/thumb/` rule; Danbooru/Gelbooru/Moebooru clones → `booru.ts`. CDN rules cover
LOFTER (`imglf`), Naver (`pstatic`), Weibo images (`sinaimg`), Bilibili images (`hdslb`), ImgBB (`ibb`), Catbox (free-ride), Blogspot, Giphy, VSCO, Misskey, DeviantArt (wixmp). `500px` is closed
(signed).

## Highest-leverage next builds

1. **VK + Steam** — CDN rules, byte-verified, ~10 lines each.
2. **MangaDex** — anchors a whole new *manga* category (open API, clean, bulk win).
3. **Bunkr** — live album reader (proven pattern).
4. A **XenForo forum reader** (covers simpcity/titsintops/socialmediagirls at once)
   and a **hentai-gallery template** (imhentai/hentaifox family) — high fan-out.
