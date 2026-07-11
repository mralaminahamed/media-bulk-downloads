# Desktop apps, CLI tools & site-specific extensions

> The rest of the field: power-user desktop/CLI tools (the extraction-quality benchmark) and the
> long tail of single-site browser extensions (the real day-to-day competition). Facts web-verified
> July 2026. See [`README.md`](./README.md) and [`feature-matrix.md`](./feature-matrix.md).

**Framing:** yt-dlp and gallery-dl are the **extraction-quality benchmark** — the most complete,
accurate, most-sites-supported downloaders in existence. But they are high-friction: no GUI, must be
installed (package manager / Python), require periodic updating as sites change, and demand terminal

+ flag comfort. That is exactly the gap an extension exploits: **"power of the CLI, ease of an
  extension."**

---

## Desktop / CLI (power-user competitors)

### JDownloader 2

- **Vendor:** AppWork GmbH. **Type:** desktop app (Java). **Platforms:** Win/macOS/Linux.
- **Price:** free & open-core; optional paid **Premium** (higher speeds via 200+ partner hosts, more parallelism, ad removal).
- **Upkeep:** active, rolling nightly builds; established since ~2009.
- **Scope:** broadest "link grabber" — file hosters (Mega, MediaFire, Pixeldrain, Mixdrop…), plus YouTube and many video sites via plugins; images, archives, playlists.
- **Features:** clipboard link-grabber auto-capture; batch/parallel with throttling and pause/resume; auto-extract RAR/ZIP; container (.dlc) support; scriptable via MyJDownloader remote.
- **Strength:** unmatched for file-hoster link management and resumable batch queues.
- **Vs an extension:** heavy Java install; dated Swing UI; bundled-offer reputation in some installers; **not in-page** — you copy links out of the browser into a separate app; overkill for
  social-media grabbing.

### yt-dlp (CLI) — *extraction benchmark*

- **Vendor:** yt-dlp org (successor to youtube-dl). **Type:** CLI (Python). **Platforms:** Win/macOS/Linux/BSD.
- **Price:** free, open source (Unlicense).
- **Upkeep:** **very active** — ~177K GitHub stars, release ~every 2 weeks, >12M PyPI downloads/month; the de-facto standard, shipped in Debian/Ubuntu.
- **Scope:** ~1,800+ site extractors (YouTube, TikTok, Twitter/X, Instagram, Facebook, Twitch, Vimeo, Bilibili, SoundCloud…); video/audio with full format/quality selection, subtitles, metadata,
  thumbnails.
- **Features:** best-in-class format selection (`-f`), merges video+audio via ffmpeg; playlists/channels/live/sponsorblock/chapters; `--cookies-from-browser` for logged-in content; post-processing (
  audio→MP3, embed metadata/thumbnails); massively scriptable.
- **Strength:** the most complete and accurate media extractor in existence — if a video is on the open web, yt-dlp likely gets it at max quality.
- **Vs an extension:** **no GUI** (dozens of flags); must be **installed** (Python/binary + ffmpeg) and **updated frequently** or extractors break; no in-page UI (find/paste URLs yourself);
  manual/technical cookie handling; intimidating for non-technical users — the whole opportunity.

### gallery-dl (CLI) — *image/gallery benchmark*

- **Vendor:** Mike Fährmann (`mikf`). **Type:** CLI (Python). **Platforms:** Win/macOS/Linux.
- **Price:** free, open source (GPL-2.0).
- **Upkeep:** active — ~18.8K+ stars; moving to Codeberg (Apr 2026); regular extractor updates.
- **Scope:** **300+ sites** focused on images/galleries — Pixiv, DeviantArt, Twitter/X, Instagram, Reddit, Pinterest, Danbooru/booru, Flickr, ArtStation, Sankaku, Bilibili; full-res originals + JSON
  metadata.
- **Features:** bulk-downloads entire profiles/boards/tags/galleries at original resolution; rich JSON sidecar; configurable filename templates; cookie/OAuth auth; resumable, deduplicating archive
  tracking; pairs with yt-dlp (images vs video).
- **Strength:** gold standard for bulk **image** archiving from social/art sites at original res with metadata.
- **Vs an extension:** **no GUI**, terminal-only, JSON config; install + periodic updates; no in-page selection UI (operates on URLs, not what you're looking at); technical auth setup.

### 4K Video Downloader Plus / 4K Stogram

- **Vendor:** 4K Download (Open Media LLC). **Type:** desktop GUI. **Platforms:** Win/macOS/Linux.
- **Price:** 4K VD Plus — free Starter (~10/day, ads); Personal ~$25 lifetime; Pro ~$45 lifetime. Stogram was ~$15/$45 one-time.
- **Upkeep:** 4K VD Plus **active** (v26.x). **⚠ 4K Stogram DISCONTINUED** — retired due to Instagram restrictions; no updates/support/sales.
- **Scope:** 4K VD Plus — YouTube/TikTok/Facebook/Vimeo/SoundCloud; up to 4K/8K, MP3 extraction, playlists/channels, subtitles. Stogram — Instagram photos/stories/reels/hashtags.
- **Strength:** polished, approachable GUI over strong YouTube extraction; lifetime-license pricing.
- **Vs an extension:** separate desktop install; free tier heavily throttled/ad-laden; per-app per-platform silos (one app for video, a now-dead one for Instagram); no in-page UX. Stogram's death
  illustrates the fragility of single-site desktop tools.

### Instaloader (CLI)

- **Vendor:** open-source community. **Type:** CLI (Python). **Price:** free (MIT).
- **Upkeep:** **⚠ stale / effectively unmaintained** — ~12.7K stars but **no release since ~Nov 2025**; unresolved bug reports (incl. Jul 2026); users report breakage.
- **Scope:** Instagram only — posts, stories, highlights, reels, profile pics, captions + metadata; download by profile/hashtag/location/feed.
- **Strength:** deep, scriptable full-profile Instagram archiving with metadata — when it works.
- **Vs an extension:** no GUI, terminal + Python; **single-site + going stale** (IG changes break it, fixes slow); manual session handling; higher account-risk with heavy scraping.

### youtube-dl — *deprecated, cite as a cautionary tale*

- **Vendor:** ytdl-org. **Type:** CLI (Python). **Price:** free (Unlicense).
- **Upkeep:** **⚠ deprecated / near-abandoned** — development slowed after 2021; superseded by yt-dlp; removed from Debian 12 (replaced by an empty package depending on yt-dlp).
- **Scope:** historically the broad video/audio extractor, but extractors are outdated and frequently fail (esp. YouTube signature changes).
- **Note:** cite only to say "use yt-dlp instead" — a cautionary tale of tool rot, not a live competitor.

---

## Site-specific browser extensions (the long tail)

Collectively the real day-to-day competition: zero-install-friction, in-page, one-click — but each is
**narrow, quality-inconsistent, frequently removed for policy/malware, and often freemium-gated**.
This is the "convenient but shallow" flank a single power-extension can consolidate.

### "Downloader for Instagram"–style

- Examples: Turbo / Promaster / Mass / Ultra Downloader for Instagram (small devs). Chromium, some Firefox. Free/freemium (daily caps, "pro" upsells).
- **Churny + risky:** new clones constantly; **Ultra Downloader removed from CWS Sept 2025 for malware**; "Bulk Downloader for Instagram™" removed 2023 for policy. Reels/stories/photos/highlights;
  some add a profile "Download All."
- **Vs us:** single-site; frequent malware/policy takedowns; sketchy permissions; freemium caps/ads; original-res inconsistent; break on IG markup changes.

### Twitter/X video downloaders

- Examples: X Video Downloader, X Downloader, "Download Twitter Videos" (Firefox, open-source), Tweeload. Chrome + Firefox. Free/freemium ("3 HD/day" then pro).
- Media: X/Twitter video + GIF (MP4), some quality selection; single-tweet focused.
- **Vs us:** single-site, single-media-type (video/GIF, not images-at-scale); struggle with threads/multi-video tweets; free HD caps; spotty upkeep; break on UI changes.

### Pinterest / Reddit savers

- Pinterest: Unpinned, Pin Toolbox, Pinterest Bulk Saver, pinterest-board-downloader (GitHub). Reddit: Reddit Video Downloader, RedditSave, Reddit Image Saver (No WebP). Chromium; some Firefox.
  Free/freemium — **Unpinned free caps boards at 50 pins**.
- Media: Pinterest whole boards/pins (images+video, high-res); Reddit post video with **audio muxing** (a known pain point) + original-quality images avoiding WebP; some bulk-by-subreddit.
- **Strength:** solve platform-specific quirks natively (Reddit split audio/video, Pinterest board bulk, original-res over WebP).
- **Vs us:** one site each → user needs a different extension per platform (extension sprawl); free tiers gated; break on redesigns.

---

## Cross-cutting weaknesses of the long tail (positioning ammo)

- **Fragmentation:** one narrow extension per site → users install 4–6 sketchy tools instead of one.
- **Trust/safety:** recurring malware and policy removals from the Web Store; over-broad permissions.
- **Freemium friction:** daily caps, watermarks, pin/quality limits.
- **Extraction shallowness:** most scrape the visible DOM, not site APIs → miss originals, metadata, lazy-loaded and paginated media that gallery-dl/yt-dlp capture reliably.
- **Fragility & MV3:** break on redesigns; MV3 + Web Store policy increasingly restrict capture (YouTube/DRM).

**The wedge:** a single extension that pairs **site-aware original+metadata extraction across many
platforms** with **zero-install, in-page, one-click bulk selection** — no terminal, no separate app,
no per-site extension zoo, no watermarks — occupies the empty quadrant between the CLI benchmark
(accurate but hard) and the extension long tail (easy but shallow, narrow, untrustworthy).
