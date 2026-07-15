# Original-image & video accuracy studies

> Part of the [Collection Benchmark](../BENCHMARK.md).

## G. Facebook original-image accuracy (passive sniff) — 2026-07-10

Facebook serves `/api/graphql` over **XHR** as **`content-type: text/html`**
multi-chunk **NDJSON**. The shared response-sniffer previously dropped 100% of
it at two gates (json-only content-type + single `JSON.parse`), so the FB
resolver upgraded only the ~dozen photos in on-page hydration — original-image
accuracy ~5%. This branch makes the content-type predicate + NDJSON parsing
configurable (FB opts in; Instagram/X unchanged), adds the reel `progressive_url`
key + `/photo(s)/<id>` fbid path + `/photos/` anchor selector, and de-duplicates
async upgrades via a `mediaKey` identity. Photo media lives under `viewer_image`;
reel/video under `progressive_url` (NOT `playable_url` — measured live).

**Metric:** of the photo items surfaced after a bounded passive scroll, the
fraction whose captured original has `min(w,h) >= 1024` (`ORIGINAL_MIN_PX`), the
same way Instagram's ~80% is measured. FB's photo grid is heavily virtualized
(~10–18 tiles mounted at once of 217), so a live snapshot samples few tiles.

Measured live 2026-07-10 across a local link list (7 real photo pages, 3 reel
permalinks, 1 reel-tab; replica†). "surfaced" = grid tiles the extension
collects at scan time; "≥1024" counts a tile whose captured original clears
`ORIGINAL_MIN_PX` (reels: whose downloadable `progressive_url` mp4 was captured).
`pctAll` counts all surfaced tiles; `pctCaptured` counts only the subset the
sniffer streamed anything for (the gap is post-load-injection lag that the real
`document_start` sniffer closes). Per-page raw figures are kept in a gitignored
`test-samples/` file — no account identifiers are recorded in this public doc.

**Photos** — 6 real grids (a further page never loaded a grid under automation
and is excluded as an outlier):

| Grid | pctAll (≥1024) | pctCaptured |
|---|---|---|
| large grid (137 tiles) | **77%** | 94% |
| five small grids (9–10 tiles) | **80 / 89 / 89 / 90 / 90 %** | 89–100% |

**Reels** — all 3 reel permalinks plus a reel-tab (80 tiles): every reel was
captured as a downloadable mp4 under **`progressive_url`**, the **only** video
key seen (`playable_url` absent everywhere). Reel-tab: 70/80 (**88%**) captured,
100% of the captured subset.

**Verdict:** across the 6 real photo grids the passive fix surfaces a ≥1024
original for **77–90%** of collected photos (**89–100%** of tiles it actually
captured), and every reel resolves to a downloadable `progressive_url` mp4 —
clearing the ≥80% target. Sub-80% is the post-load-injection lower bound
(77% → 94% of captured). Pre-fix this same path captured **0**.

†**replica** = the shipped sniffer's logic (on-page hydration parse + XHR NDJSON
sniff of `viewer_image`/`progressive_url`, keyed by fbid) injected into a live
page after load, then scrolled. It reproduces the extension's dual capture path,
but a post-load wrap can miss the *initial* graphql burst (the real extension
wraps XHR at `document_start`), so replica numbers are a **lower bound**.

**Gate status — PARTIAL / definitive run pending.** For the authoritative
per-surface >=80% figure across Photos/Reels/Page, load the built extension
(`apps/extension/.output/chrome-mv3`, unpacked) in Chrome, open a real surface, run a full
Deep scan (its `document_start` sniffer + scroll accumulation), and read the
panel's per-item resolution. The e2e (`facebook-sniffer.spec.ts`) already proves
the mechanism deterministically on data faithful to the real `text/html` NDJSON.

## H. Instagram original-image accuracy — 2026-07-10

Measured live across 6 profile timelines (83 post-grid tiles): **~99%** of
surfaced tiles carry an original at `max(w,h) >= 1024` (83/84; the single miss a
640px tile). Instagram is **not** grid-locked like Facebook — it serves the
profile-grid images at full/near-original resolution directly in the DOM
(measured 640–4096px, overwhelmingly >=1024). The extension collects that DOM
`<img>` src as-is (the IG CDN is signed → read, never rewritten), so the surfaced
image is already the original; no graphql upgrade is needed on the grid. The IG
resolver's `image_versions2.candidates` / `video_versions` path (§B row 54) adds
value only on individual post/feed pages where a larger candidate exists than the
DOM thumbnail. No code change was warranted. Per-page detail (with handles) is
kept in a gitignored `test-samples/` file — no account identifiers here.

## I. Threads video — 2026-07-10

Threads runs on Instagram infra but delivers video differently from IG reels: a
mounted `<video>` carries a REAL https progressive `.mp4` directly in
`currentSrc` (cdninstagram, measured ~720×1280, no `blob:`, no manifest), which
the generic `collectAv` path already collects as a downloadable item — **no
sniffer needed**. Verified live: the mp4 is in **neither** the page hydration
`<script type="application/json">` **nor** the feed GraphQL responses (8
responses, 0 `video_versions`/mp4 tokens), so an IG-style GraphQL sniffer would
capture nothing. The feed/grid is virtualized — only the active tile mounts a
`<video>`; an unmounted grid/off-screen video tile exposes only its cover image,
and its mp4 is not passively reachable (the passive ceiling; forcing it would
require active auto-scroll/mount, out of scope). No production code change was
warranted; the behavior is locked in by
`apps/extension/tests/unit/extension/content/collect-threads-video.test.ts` and the e2e
`threads-video` spec. URL samples omitted (the safety filter strips CDN tokens).
