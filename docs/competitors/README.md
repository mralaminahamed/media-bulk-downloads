# Competitor analysis

Landscape of tools that compete with **Media Bulk Downloads** for bulk media (image / video / audio)
downloading — browser extensions, desktop apps, and CLI tools. Written to sharpen positioning, store
copy, and roadmap.

- **Compiled:** July 2026. **Method:** web-verified against Chrome Web Store / AMO listings and vendor
  sites (~25 tools, ~65 searches across three research passes). Install counts are the stores' rounded
  buckets; anything unconfirmed is flagged in the detail docs. **This data drifts** — versions, prices,
  and listings change monthly; re-verify before quoting in public material.

## Contents

| Doc                                                                      | Covers                                                                                                                                                             |
|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [`image-downloaders.md`](./image-downloaders.md)                         | Image Downloader, Imageye, Fatkun, Download All Images, Simple Mass Downloader, Tab Save, Download Master, BID (paid desktop)                                      |
| [`video-and-stream-downloaders.md`](./video-and-stream-downloaders.md)   | Video DownloadHelper, FetchV, Stream Recorder, CocoCut, HLS Downloader (puemos / cssnr), Stream Detector, DownThemAll — plus the MV3/DRM policy ceiling            |
| [`desktop-cli-and-site-specific.md`](./desktop-cli-and-site-specific.md) | JDownloader 2, yt-dlp, gallery-dl, 4K Video Downloader / Stogram, Instaloader, youtube-dl; and the site-specific extension long tail (IG / X / Pinterest / Reddit) |
| [`feature-matrix.md`](./feature-matrix.md)                               | Head-to-head ✅/⚠️/❌ grid — capture capability + product/trust                                                                                                      |

## Executive summary

The market splits into **four segments**, each with a structural weakness:

1. **Image grabbers** (Image Downloader, Imageye, Fatkun, Download All Images) — the biggest install
   bases (two at ~2M users), but **images only**, mostly read the visible DOM (miss true originals /
   lazy / API-served media), ZIP + format-convert are inconsistent, and the two leaders are an
   **anonymous vendor** and an **extension-acquirer** — a trust soft spot.
2. **Video / stream rippers** (Video DownloadHelper, FetchV, CocoCut…) — real HLS/DASH assembly, but
   **video only** (no image pipeline), several are freemium/watermarked, and **all hit the same
   ceiling: no DRM, no YouTube** under Web Store policy + MV3.
3. **CLI power tools** (yt-dlp, gallery-dl) — the **extraction-quality benchmark** (1,800 / 300+
   site-aware extractors, originals + metadata, auth'd content), but **no GUI, must be installed and
   constantly updated, operate on URLs you supply** — a wall for non-technical users.
4. **Site-specific extensions** (Downloader-for-Instagram, X video savers…) — frictionless and
   in-page, but **one site each**, freemium-gated, and a **recurring malware/policy-removal risk**
   (real 2023 & 2025 CWS takedowns). Users end up with 4–6 sketchy single-site tools.

**No competitor is strong on more than one of: media breadth, extraction depth, in-page ease, and
trust.** That is the opening.

## Where Media Bulk Downloads sits

```
                 EXTRACTION DEPTH (originals, site-aware, metadata)
                 low ───────────────────────────────────► high
   in-page  ┌─────────────────────────┬─────────────────────────┐
    EASE    │  Image grabbers          │   ◆ Media Bulk Downloads │
   (GUI,    │  (Imageye, Image Dl,     │   video rippers reach    │
   1-click, │   Fatkun) · site-        │   here only for video    │
   zero-    │   specific IG/X tools    │   (VDH, FetchV)          │
   install) ├─────────────────────────┼─────────────────────────┤
   terminal │  youtube-dl (rotting)    │   yt-dlp · gallery-dl    │
   /install │  Tab Save (dead MV2)     │   (CLI benchmark)        │
            └─────────────────────────┴─────────────────────────┘
```

We aim for the **top-right**: CLI-grade site-aware extraction with extension-grade ease — the quadrant
no other single tool occupies for *all* media types.

### Differentiators (unique, or a rare combination)

- **Only tool that is all-media generalist + site-aware in one in-page UI.** Image grabbers skip
  video; video rippers skip images; the CLIs skip the GUI. We scan any page for image **+** video **+**
  audio, upgrade to originals (srcset / 50+ CDN families / de-proxy / ~60 per-site resolvers), **and**
  capture HLS (m3u8, AES-128 decrypt + assemble) and route DASH — no companion app.
- **EXIF/XMP-preserving format conversion** (WebP/AVIF→PNG/JPEG, metadata kept by default, opt-in
  strip). Effectively unique — only Imageye converts at all, and only WebP→JPG with no metadata story.
- **Trust wedge:** network-free by default, **open source (MIT)**, no accounts / analytics / servers,
  no watermark, free. Directly answers the distrust around the anonymous/acquirer-owned 2M-user leaders
  and the malware-prone site-specific tools.
- **One tool, four browsers, current MV3** (Chrome / Firefox / Edge / Safari from one codebase) while
  DownThemAll's Chrome build is dead post-MV2 and much of the field is Chrome-only.
- **Depth the grabbers lack:** deep-scan auto-scroll, near-duplicate (pHash) detection, multi-tab
  collection, ZIP, path templates (`{host}`/`{domain}`/`{date}`/`{kind}`), per-host settings,
  history, favourites, backup/restore, on-page bubble, context-menu + shortcuts.

### Honest weaknesses / real threats

- **DRM & YouTube video:** we deliberately refuse DRM and live, and only produce YouTube *poster
  thumbnails*, not video. This is the whole-market ceiling — parity, not a disadvantage — but users
  who want YouTube MP4s will still reach for a desktop app / CLI.
- **Extractor breadth vs the CLIs:** ~60 resolvers against gallery-dl's 300+ and yt-dlp's 1,800+. They
  also do **authenticated/private content, whole profiles/playlists, and metadata sidecars** — all
  out of scope for our passive, network-free-by-default model.
- **Video maturity vs VDH:** VDH has 1,000+ video sites, mature variant selection, and video-format
  transcoding; our video story is younger and image-led.
- **Niche wins we don't chase:** Fatkun's e-commerce product-image grouping; BID's
  thumbnail→full-image link-following across thousands of host galleries.
- **Distribution gap:** leaders have ~2M users and years of reviews; we are the newcomer — a
  discovery/brand problem more than a product one.

## Opportunity signals (roadmap candidates, not commitments)

Drawn from what competitors ship and we don't:

- **More site resolvers** toward gallery-dl parity where our passive model allows — DeviantArt and
  other targets still on the [BENCHMARK](../BENCHMARK.md) radar (Pixiv, ArtStation, Flickr, and
  Sankaku have since shipped).
- **E-commerce product-image grouping** (a Fatkun niche).
- **Optional metadata JSON sidecar** on download — gallery-dl parity for archivists.
- **Video variant/quality picker + audio-only (MP3) extraction** — VDH/CocoCut parity for the video
  side.
- **"Copy as yt-dlp / ffmpeg command"** for streams we *refuse* (DRM/live) — turns a hard "no" into a
  power-user handoff, the one genuinely clever idea in the otherwise-stale Stream Detector.

## One-line positioning

> **The power of yt-dlp / gallery-dl, in one click, for everything on the page — images, video, and
> audio — fully on-device and open source.**
