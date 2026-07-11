# Feature matrix — Media Bulk Downloads vs the field

> Head-to-head against the top tool in each category. Web-verified July 2026.
> ✅ yes · ⚠️ partial / caveated · ❌ no · — not applicable.
> Detail and sources: [`image-downloaders.md`](./image-downloaders.md),
> [`video-and-stream-downloaders.md`](./video-and-stream-downloaders.md),
> [`desktop-cli-and-site-specific.md`](./desktop-cli-and-site-specific.md).

## A. Capture & output capability

| Tool                            | Any-site page scan | Images | Progressive video | HLS/DASH assembly | Original-quality upgrade¹ | Lazy / deep-scroll | ZIP bundle | Format convert | Naming / path templates |
|---------------------------------|:------------------:|:------:|:-----------------:|:-----------------:|:-------------------------:|:------------------:|:----------:|:--------------:|:-----------------------:|
| **Media Bulk Downloads (this)** |         ✅          |   ✅    |         ✅         |         ✅         |             ✅             |         ✅          |     ✅      |       ✅        |            ✅            |
| Image Downloader (Pact)         |         ✅          |   ✅    |         ❌         |         ❌         |            ⚠️             |         ❌          |     ❌      |       ❌        |           ⚠️            |
| Imageye                         |         ✅          |   ✅    |         ❌         |         ❌         |            ⚠️             |         ❌          |     ❌      |       ✅²       |            ❌            |
| Fatkun                          |         ✅          |   ✅    |         ❌         |         ❌         |            ⚠️             |         ⚠️         |     ✅      |       ❌        |           ⚠️            |
| Download All Images             |         ✅          |   ✅    |         ❌         |         ❌         |            ⚠️             |         ✅          |     ✅      |       ❌        |           ⚠️            |
| Simple Mass Downloader          |        ⚠️³         |   ✅    |        ⚠️         |         ❌         |             ❌             |         ❌          |     ❌      |       ❌        |            ✅            |
| Video DownloadHelper            |         ✅          |   ❌    |         ✅         |         ✅         |             —             |         —          |     ❌      |       ✅⁴       |           ⚠️            |
| FetchV                          |         ✅          |   ❌    |         ✅         |        ⚠️⁵        |             —             |         —          |     ❌      |       ⚠️       |           ⚠️            |
| DownThemAll                     |         ✅          |   ✅    |        ⚠️         |         ❌         |             ❌             |         ❌          |     ❌      |       ❌        |            ✅            |
| gallery-dl (CLI)                |        ⚠️⁶         |   ✅    |        ⚠️         |         ❌         |             ✅             |         ✅          |     ❌      |       ❌        |            ✅            |
| yt-dlp (CLI)                    |        ⚠️⁶         |   ⚠️   |         ✅         |         ✅         |             ✅             |         ✅          |     ❌      |       ✅⁴       |            ✅            |
| JDownloader 2                   |        ⚠️³         |   ✅    |         ✅         |        ⚠️         |            ⚠️             |         ❌          |     ❌      |       ❌        |            ✅            |

¹ *srcset / CDN thumbnail→original / de-proxy / site-aware resolvers.*
² *Imageye: WebP→JPG only.*
³ *Link/URL extractor, not a page-scanning image scraper.*
⁴ *Video-format transcode (ffmpeg), not raster image conversion.*
⁵ *FetchV: HLS→MP4 solid; DASH not clearly supported.*
⁶ *Site-specific extractors driven by a URL you supply, not a scan of the page you're viewing.*

## B. Product, distribution & trust

| Tool                            | In-page one-click UI | Local-only (no server) |  Open source   |        Price         | Browsers                  | MV3-current | Primary focus                          |
|---------------------------------|:--------------------:|:----------------------:|:--------------:|:--------------------:|---------------------------|:-----------:|----------------------------------------|
| **Media Bulk Downloads (this)** |          ✅           |           ✅            |    ✅ (MIT)     |         Free         | Chrome · Firefox · Edge   |      ✅      | All media, generalist **+** site-aware |
| Image Downloader (Pact)         |          ✅           |           ✅            |      ⚠️⁷       |         Free         | Chrome · Edge · Brave     |      ✅      | Images                                 |
| Imageye                         |          ✅           |          ⚠️⁸           |       ❌        |         Free         | Chrome · Firefox          |      ✅      | Images                                 |
| Fatkun                          |          ✅           |           ✅            |       ❌        |         Free         | Chrome · Edge             |      ✅      | Images (e-com / multi-tab)             |
| Download All Images             |          ✅           |           ✅            |       ❌        |         Free         | Chrome · Edge             |      ✅      | Images (gallery)                       |
| Simple Mass Downloader          |          ✅           |           ✅            |       ❌        |         Free         | Chrome · FF · Edge        |      ✅      | All-files manager                      |
| Video DownloadHelper            |          ✅           |           ✅            |       ❌        | Freemium (watermark) | Chrome · FF · Edge        |      ✅      | Video                                  |
| FetchV                          |          ✅           |           ✅            |       ❌        |         Free         | Chrome · Edge             |      ✅      | Video (HLS)                            |
| DownThemAll                     |          ✅           |           ✅            |       ✅        |         Free         | Firefox (Chrome MV2 dead) |      ❌      | Mass files                             |
| gallery-dl (CLI)                |          ❌           |           ✅            |       ✅        |         Free         | — (terminal)              |      —      | Image/gallery archiving                |
| yt-dlp (CLI)                    |          ❌           |           ✅            |       ✅        |         Free         | — (terminal)              |      —      | Video/audio extraction                 |
| JDownloader 2                   |          ❌⁹          |           ✅            | ⚠️ (open-core) |       Freemium       | Desktop app               |      —      | File-hoster manager                    |

⁷ *Was MIT under the original author; now owned by an acquirer — current licensing/trust unclear.*
⁸ *Declares local, but reverse-image-search + social features imply outbound calls; opaque vendor.*
⁹ *Clipboard/link handoff into a separate desktop app — not in-page.*

## Reading the matrix

- **No single competitor fills a full row of ✅ in table A.** Image tools stop at images; video tools
  ignore images; the CLIs are all-✅ on capture but all-❌ on in-page UX. This extension is the only
  row that is ✅ across image **and** video capture **and** in-page UX **and** local/open-source/free.
- The honest ceilings: **DRM and YouTube video are ❌ for every consumer tool here** (see the video
  doc). The CLIs beat everyone on **breadth of site-aware extractors and metadata** (1,800 / 300+ vs
  our ~20 resolvers). Those are the two fronts where we are genuinely behind — by design on the first,
  by scope on the second.
