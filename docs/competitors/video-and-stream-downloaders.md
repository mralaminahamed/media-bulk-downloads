# Video / stream download extensions

> Competitor detail — tools that capture video: progressive MP4, and adaptive **HLS (.m3u8)** /
> **DASH (.mpd)** streams. Facts web-verified July 2026; uncertain items flagged inline. See
> [`README.md`](./README.md) and [`feature-matrix.md`](./feature-matrix.md).

## The MV3 / store-policy constraint (why many broke)

Chrome finished sunsetting **Manifest V2** in 2025 (disabled by default Mar 31 2025, override removed
Jul 24 2025). Under standard **MV3**, extensions can no longer use *blocking* `webRequest` to
intercept/rewrite media responses — they must sniff **passively** (declarativeNetRequest / observation),
which is why many old grabbers broke. Chrome Web Store policy also bans downloading content "in
violation of a third-party's Terms of Service," so **YouTube and most Widevine-DRM subscription
streaming are effectively off-limits** — DRM is enforced at key-exchange (Widevine L1/L3) and none of
these tools decrypt it. A cluster of low-install grabbers and repeat offenders were purged/relisted
through 2025.

**Bottom line: no consumer extension decrypts DRM, and none reliably do YouTube on Chrome.** The
competition is entirely about non-DRM HLS/DASH/progressive capture.

---

## Video DownloadHelper — category leader

- **Vendor:** mig.gs / downloadhelper.net (ACLAP).
- **Platforms:** Firefox, Chrome, Edge. Historically shipped a desktop **companion app (vdhcoapp)** — **removed in v10**; no companion needed now.
- **Price:** Freemium. Free core; one-time **premium** unlocks watermark-free + unlimited high-quality conversions, faster processing.
- **Manifest / upkeep:** MV3, Firefox v10.5.10.2, updated ~**Jul 10 2026** — actively maintained, the leader. ~1.8M Firefox users; vendor claims **20M+ globally**.
- **Media:** HLS (.m3u8), **DASH (.mpd)**, progressive MP4, audio streams; 1000+ sites; converts MP4/MKV/WebM. No DRM.
- **Features:** network sniffing of HLS/DASH manifests + **segment assembly** into one file; quality/variant selection; ffmpeg conversion; batch/queue; smart naming. **v10 (Dec 2025):** HLS/MP4
  processing now **in-browser via native APIs** — no companion app, uses browser cache.
- **Strength:** most mature, broadest coverage; now self-contained with true HLS **and** DASH assembly.
- **Gaps:** YouTube/DRM blocked; free tier **watermarks conversions** and throttles high-quality output (premium upsell); legacy (<v10) coapp caused antivirus flags / CPU issues (the reason it was
  dropped).
- **Network:** local; v10 processes via native browser APIs/cache, no server-side conversion.

## FetchV — popular HLS→MP4

- **Vendor:** fetchv.net ("idxF").
- **Platforms:** Chrome, Edge, Chromium. No true Firefox; no mobile.
- **Price:** Free extension (vendor also runs a freemium web m3u8 service).
- **Manifest / upkeep:** MV3, actively maintained. Chrome ~**600K users** (~4.7–4.9★); Edge ~770K. *Caution: many near-identical FetchV listings exist; an older "addonx" clone (~300K)
  was **removed Jun 17 2024 for policy violation** — install the fetchv.net-owned one.*
- **Media:** HLS (.m3u8) merged to a single **MP4**; progressive MP4/WebM/FLV; **"recording mode"** captures `blob:` streams when no direct URL. No DRM; DASH not clearly supported.
- **Features:** real-time detection, **segment merge to MP4**, multi-thread download, resolution/variant switching, preview, batch, blob recording.
- **Strength:** fast, reliable, very popular HLS→MP4 with fully local merging.
- **Gaps:** no DRM/YouTube; closed source; confusing clone ecosystem.
- **Network:** local; vendor states on-device, no third-party servers.

## Stream Recorder (hlsloader.com)

- **Platforms:** Chrome; Firefox "coming"; Edge unstated.
- **Price:** Free.
- **Manifest / upkeep:** MV3. One 2025 roundup cites ~1M+ users, 4.5★, updated Oct 2025 — **figures unconfirmed**.
- **Media:** HLS/.m3u8 (live **and** archived) remuxed to **MP4 without re-encoding**; separate capture mode for MP4/blob.
- **Features:** auto-detect + manual capture fallback; **live-stream recording**; local lossless remux.
- **Strength:** strong for recording *live* HLS with lossless local MP4 remux.
- **Gaps:** no DRM; HLS-centric (DASH not emphasized); Chrome-first.
- **Network:** local remux, no external server.

## CocoCut (cococut.net)

- **Platforms:** Chrome, Edge.
- **Price:** Free (light upsell — uncertain).
- **Manifest / upkeep:** MV3; promoted in 2025–26 roundups; **install count / last-update not store-verified**.
- **Media:** **both HLS (.m3u8) and DASH (.mpd)** + progressive MP4/WebM; **audio extraction**.
- **Features:** sniffs adaptive streams, quality selection, audio-only extraction, batch.
- **Strength:** one of few browser tools covering **HLS *and* DASH** plus audio extraction.
- **Gaps:** no DRM/YouTube; closed source; some upsell; verify figures independently.
- **Network:** local claimed (unverified server component).

## HLS Downloader (puemos) — open-source WASM

- **Vendor:** puemos (GitHub), MIT.
- **Platforms:** Chrome, Edge, Firefox (store builds); Brave/Arc/Opera manual. No companion app.
- **Price:** Free, open source.
- **Manifest / upkeep:** MV2 (Firefox) + MV3 (Chromium), v5.4.4, ~**May 12 2026** — active, 2.6K+ GitHub stars.
- **Media:** **HLS only — no DASH.** Sniffs m3u8, assembles segments into MP4 via **ffmpeg compiled to WebAssembly** in the tab.
- **Features:** fully client-side sniff + assemble, variant pick, nothing uploaded.
- **Strength:** fully local, open-source HLS→MP4 with **in-browser ffmpeg.wasm — no native app**.
- **Gaps:** HLS only; WASM ffmpeg is memory-heavy/slower on long streams.
- **Network:** fully local; "nothing uploaded."

## HLS Video Downloader (cssnr) — native FFmpeg companion

- **Vendor:** cssnr (GitHub), GPL-3.0.
- **Platforms:** Chrome, Firefox, Edge, Brave, Vivaldi, Opera. **Requires a native FFmpeg companion app** (native messaging).
- **Price:** Free, open source.
- **Manifest / upkeep:** v0.0.9, ~**Feb 24 2026** — early-stage but active; small user base.
- **Media:** HLS (.m3u8) handed to **real native FFmpeg** for assembly (handles complex streams better than WASM).
- **Strength:** real native FFmpeg = reliable HLS handling.
- **Gaps:** **mandatory companion-app install** = setup friction; v0.0.x maturity; small adoption; HLS-focused; no DRM.
- **Network:** local (native ffmpeg on your machine); no server.

## The Stream Detector — URL/CLI-command generator (not a ripper)

- **Vendor:** 54ac (GitHub), open source.
- **Platforms:** Firefox (maintained; also Android). Chrome build "not maintained or supported."
- **Price:** Free, open source.
- **Manifest / upkeep:** v2.11.7, **last release Jul 2023** — development on hold (effectively parked).
- **Media detected:** HLS (.m3u8), DASH (.mpd), HDS (.f4m), MS Smooth (.ism); arbitrary extensions/Content-Types.
- **Features:** passively sniffs manifest URLs; copies them or **generates ready-to-run CLI commands** for yt-dlp / FFmpeg / Streamlink / hlsdl / N_m3u8DL-RE (embedding UA/Cookie/Referer).
- **Strength:** best tool for *exposing* the real manifest URL and producing an exact, header-correct CLI command.
- **Gaps:** does **not** assemble streams itself — you must run an external CLI; stale since 2023; Chrome unsupported; copycats ("Stream Detector Pro/PLUS") with different trust.
- **Network:** fully local — reads traffic, copies URLs / builds commands.

## DownThemAll! — mass file downloader (not a stream ripper)

- **Vendor:** downthemall.net (Nils Maier et al.), open source.
- **Platforms:** Firefox (primary, incl. Android) and Chrome. **Chrome build is MV2 → dead post-2025.**
- **Price:** Free, open source; no ads/tracking.
- **Manifest / upkeep:** MV2. Firefox v4.15.1, updated ~**May 27 2026**, Mozilla **"Recommended"**, ~192K Firefox users.
- **Media:** general mass/link downloader — direct-linked files (images, docs, *progressive* MP4). **No HLS, no DASH, no stream sniffing/assembly.**
- **Features:** advanced link/media harvesting from a page, batch queue with filters, rename masks, one-click "remember" sets, fast parallel downloads.
- **Strength:** best-in-class batch downloader for **direct file URLs**.
- **Gaps:** cannot capture adaptive streams; useless for streaming-site video; Chrome build dead post-MV2.
- **Network:** fully local, open source.

## Name-collision cautions

- **"Stream Video Downloader" (AMO, METRUYENCHU):** v1.0, ~460 users, 1★, 12 KB — likely just surfaces manifest URLs, **no real assembly**; broad host perms. Not the historically popular product of
  that name (pulled years ago); the name is heavily cloned. Not recommended.
- **"One-Click Video Downloader" (generic):** MV3, targets TikTok / IG Reels / Douyin progressive video; **no HLS/DASH assembly, no YouTube**; generic name = clone/adware risk — vet the specific
  listing.

---

## Quick accuracy notes

- **True in-browser HLS/DASH assembly (no companion app):** Video DownloadHelper v10, FetchV, Stream Recorder, CocoCut, HLS Downloader (puemos, WASM). **← the bracket we compete in.**
- **Needs a native companion app:** HLS Video Downloader (cssnr). VDH *used to* (vdhcoapp), no longer as of v10.
- **Not a stream ripper:** DownThemAll (direct files only); The Stream Detector (URL/CLI-command generator only).
- **DASH .mpd genuinely covered:** Video DownloadHelper, CocoCut (Stream Detector *detects* it). FetchV / Stream Recorder / puemos are HLS-only.
- **Abandoned/stale:** Stream Detector (2023); AMO "Stream Video Downloader" (1★). DownThemAll alive on Firefox but its **Chrome MV2 build is dead**.
- **Universal ceiling:** none decrypt Widevine/DRM; YouTube blocked/unsupported across the board.
