# Image bulk-download extensions

> Competitor detail — the tools users reach for when they want "grab all images on this page."
> Facts web-verified July 2026 (Chrome Web Store listings + vendor sites). Install counts are the
> Web Store's rounded "users" buckets. Anything unconfirmed is flagged inline. See
> [`README.md`](./README.md) for the executive summary and [`feature-matrix.md`](./feature-matrix.md)
> for the head-to-head grid.

---

## Image Downloader (Pact Interactive)

- **Vendor:** Pact Interactive (an extension-acquirer; original author Vlad Sabev sold it). Classic ID `cnpniohnfphhjihaiiggeabnkjhpaldj`.
- **Platforms:** Chrome, Edge, Brave (Chromium).
- **Price:** Free.
- **Manifest / upkeep:** MV3, v4.5.3, updated **Jun 26 2026**. **~2,000,000 users**, 3.7★ (2.6K ratings) — an install leader.
- **Media:** Images only.
- **Features:** grid of every `<img>`; select one/all; filter by width/height and URL substring; de-dup; save to a named subfolder; rename; background (non-blocking) downloads.
- **Strength:** clean, fast, long-trusted — the "default" image grabber for millions.
- **Gaps:** ownership moved to an acquirer (historical red flag for later monetization/permission creep; rating slid to 3.7); **no ZIP** (loose files), no deep-scroll/lazy crawl, weak on
  CSS-background/canvas/blob; struggles on JS-heavy SPAs.
- **Network:** local DOM scan, direct `chrome.downloads`. No server round-trip, but broad host perms + new owner warrant scrutiny.

## Imageye — Image downloader

- **Vendor:** Imageye (imageye.net; effectively anonymous dev contact).
- **Platforms:** Chrome (`agionbommeaifngbhincahgmoflcikhm`) + Firefox.
- **Price:** Free.
- **Manifest / upkeep:** MV3, v5.30.1, updated **Mar 18 2026**. **~2,000,000 users**, 4.9★ (16.4K ratings) — the other install leader. *4.9 at that volume is anomalously high; Imageye has a long
  reputation for review inflation — treat the rating skeptically.*
- **Media:** Images only.
- **Features:** find all page images, bulk/selective; filter by pixel width/height and URL; file-size display, copy-URL, multiple preview layouts; claims IG/FB/Twitter image grabbing; reverse image
  search; **WebP→JPG conversion**.
- **Strength:** broad site coverage + format conversion + reverse search in one free tool. Closest mass-market analog to an in-page image grabber with a real selection UI.
- **Gaps:** Firefox reviewers report updates repeatedly **break downloads**; persistent icon/notification dot users can't disable; anonymous dev + broad perms → recurring distrust; **no ZIP**; grabs
  rendered DOM rather than resolving true originals — no site-aware extraction (misses lazy/API-served media, no metadata).
- **Network:** declares local processing, but reverse-search + social features imply outbound calls; opaque vendor.

## Fatkun Batch Download Image

- **Vendor:** Fatkun / Futoo (fatkun.net). Split across multiple listings.
- **Platforms:** Chrome, Edge.
- **Price:** Free.
- **Manifest / upkeep:** the **maintained MV3 listing** ("Image Downloader – Fatkun Batch Save", `mojcdce…`) is v20.14.24, updated **Jul 10 2026**, ~200,000 users, 4.3★. The **legacy flagship** (
  `nnjjahli…`, the one cited at **1M+ users**) is the older MV2-era listing. *The "#1, 1M+" claim is the flagship's historical figure, not the current MV3 listing — install base is split across IDs.*
- **Media:** Images only (JPG/PNG/WebP/**AVIF**).
- **Features:** one-click "download all images"; per-image dimension + filetype preview; **drag-to-select**, Select-All/Invert; filter by width/height/type; **download images across all open tabs**; *
  *e-commerce grouping** (auto-groups product images on Amazon/Taobao/1688/Shopify); **Pinterest board/section download**; on-page keyword search; right-click quick download; ZIP; dark mode; 15+
  languages.
- **Strength:** best-in-class for **e-commerce/product-image** and **multi-tab** batch workflows.
- **Gaps:** confusing multiple listings (which is canonical?); Chinese-origin + very broad host access (some enterprise distrust); no true deep-scroll auto-crawl of infinite galleries; no format
  conversion.
- **Network:** claims no personal-data/history collection; local processing.

## Download All Images (MeryDev)

- **Vendor:** MeryDev (`nnffbdeachhbpfapjklmpnmjcgamcdmm`).
- **Platforms:** Chrome, Edge.
- **Price:** Free.
- **Manifest / upkeep:** MV3, v1.0.9, updated **Feb 17 2026**. **~200,000 users**, 4.3★. *(Version string inconsistent between CWS (1.0.9) and third-party writeups (4.0.x) — flag as uncertain.)*
- **Media:** Images only, incl. **blob:** images.
- **Features:** scans active tab for every image element **including lazy-loaded** (revealed on scroll); packages everything into a **single ZIP**; gallery preview before download; **deep search
  across linked pages** (follows links); filters to drop duplicates/unwanted-keyword images; save into **domain-named subfolders**; preview properties without downloading.
- **Strength:** ZIP-everything + lazy-load capture + link-following — the closest free feature-match to "grab the whole gallery."
- **Gaps:** persistent complaints on **JS-heavy SPAs** (broken thumbnails, misses); reliability varies by site.
- **Network:** local scan + in-browser ZIP; no server claimed.

## Tab Save (naivelocus)

- **Vendor:** naivelocus (`lkngoeaeclaebmpkgapchgjdbaekacki`).
- **Platforms:** Chrome.
- **Price:** Free.
- **Manifest / upkeep:** **MV2**, v1.4.0.2, updated **Jul 1 2014** — ~12 years stale. ~30,000 users, 4.2★. *As MV2 it is effectively end-of-life under Google's MV2 shutdown and liable to stop
  working / be delisted.* *(A separate, unrelated newer "Tab Save" by bigjpgai at `nikcaajb…` also exists — do not conflate.)*
- **Media:** **any file type** open in tabs or listed as URLs (images, PDFs…).
- **Features:** one-click download of all files open across tabs; paste a **URL list** to batch; experimental fetch of scholarly PDFs by DOI.
- **Strength:** dead-simple **URL-list → files** batcher for people who already have the links.
- **Gaps:** not an image *scraper* (you supply URLs/tabs); abandoned since 2014 (failed/empty downloads, no rename); MV2 → imminent breakage.
- **Network:** local; URLs straight to `chrome.downloads`.

## Simple Mass Downloader (George Prec)

- **Vendor:** George Prec (`abdkkegmcbiomijcbdaodaflgehfffed`).
- **Platforms:** Chrome, Edge, Firefox.
- **Price:** Free.
- **Manifest / upkeep:** MV3, v0.868, updated **Jun 30 2026**. **~100,000 users**, 4.6★. Actively maintained.
- **Media:** **all file types** (images/video/audio/docs/archives) — a general batch download manager.
- **Features:** extract links from active tab, **selected text, clipboard, local files, or URL patterns**; thumbnail grid for images, sortable by size/dimension; advanced link **filtering**; **mass
  rename** from contextual info; automatic folder routing; pause/resume; export URL lists with custom naming.
- **Strength:** most powerful **filtering + rename + URL-pattern** engine of the free tools — a proper batch download manager.
- **Gaps:** not built for streaming media or heavily JS-generated links; more a link/file manager than a one-click image scraper (steeper UX); history of CWS listing instability.
- **Network:** local; direct downloads.

## Download Master (Westbyte)

- **Vendor:** Westbyte (`dljdacfojgikogldjffnkdcielnklkce`); companion to Westbyte's desktop manager.
- **Platforms:** Chrome, Edge, Opera.
- **Price:** Free (extension + desktop app).
- **Manifest / upkeep:** v4.1.0, updated **May 1 2024**. ~100,000 users, 3.8★. Manifest version **unconfirmed**; going stale (no 2025–26 update).
- **Media:** **all file types** (general download manager).
- **Features:** scans a page and lists all downloadable files by type; image grid; hands large/multi-file jobs to the **Westbyte desktop manager** (segmented/accelerated).
- **Strength:** catches every file type, not just images; offloads to an accelerated desktop manager.
- **Gaps:** aging (2024), 3.8★; jack-of-all-trades; best value only with the desktop app installed; no srcset/lazy/CSS-background smarts; no ZIP.
- **Network:** local scan, **but hands URLs off to an external desktop app** — a handoff boundary the pure-local tools don't have.

## Bulk Image Downloader (BID) — paid desktop, for contrast

- **Vendor:** Antibody Software (bulkimagedownloader.com). Ships helper browser extensions that trigger the desktop app.
- **Type:** **Windows desktop** app (not a standalone extension).
- **Price:** **Paid — US$39.95 one-time** (1 yr free upgrades; renewal ~$15.95/yr). Unlimited-time but throttled free trial.
- **Upkeep:** active — v6.6x, latest **Oct 16 2025**.
- **Media:** full-size **images from galleries**; resolves many image-host + some video-host link pages.
- **Features:** **follows thumbnail→full-image links** and one-image-per-page host galleries (the hard part extensions fail at); understands **1000s of gallery/host sites** via built-in rules incl.
  JS + forum-embedded galleries; batch queue with **resume**; folder/template renaming; dedup; extracts originals behind redirect/host pages.
- **Strength:** resolves **thumbnail-linked and host-page galleries to true originals** far better than any in-browser extension.
- **Gaps:** paid + **Windows-only desktop** (no Mac/Linux native, no in-browser convenience); overkill for simple "grab this page"; reputation tied to adult-gallery scraping.
- **Network:** runs locally on the desktop, downloads direct from source; no third-party relay.

---

## Also seen

- **ImageAssistant (Batch Image Downloader)** — vendor pyid.pw, Chrome. Free, image-only. Strong **sniffer that captures images from network requests / CSS backgrounds / blobs** (not just `<img>`);
  size/type filters; batch. Catches images DOM-only scrapers miss. Cluttered UI; Chinese-origin/broad-permission distrust; verify current status before citing.
- Numerous **"Bulk Image Downloader From URL List"** clones at 10k–50k users — thin MV3 wrappers, not feature-competitive.

## Field-wide gaps (opportunity signals)

- **True-original capture** (CSS-background / canvas / blob / `srcset`) is weak everywhere except ImageAssistant and desktop BID — most tools read only visible `<img>` src.
- **Deep infinite-scroll auto-crawl** and **thumbnail→full-image link following** are largely absent in free extensions (only Download All Images tries link-following; only paid desktop BID does it
  well).
- **Trust/privacy** is a recurring soft spot: the two 2M-user leaders are an anonymous vendor (Imageye) and an extension-acquirer (Pact Interactive). A genuinely local, transparent, open-source tool
  has a wedge.
- **Format conversion** exists only in Imageye; **ZIP + smart naming/foldering** is inconsistent.
