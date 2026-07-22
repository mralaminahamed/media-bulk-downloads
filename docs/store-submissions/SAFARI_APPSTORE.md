# Safari — App Store submission

Safari Web Extensions are distributed as a native macOS (and optionally iOS) app
that hosts the extension, submitted through the **Mac App Store**. This is a
different pipeline from the Chrome/Edge/Firefox/Opera zip uploads.

> Status: the Safari build ships — the extension targets Safari via
> `yarn build:safari` + the `@mbd/platform` seam, the native wrapper is generated
> and built under `apps/safari-native/`, and the macOS app has been **submitted to
> the Mac App Store and is under review** (not yet live). Building, signing, and
> submitting require **macOS + Xcode + an Apple Developer account**; keep this as
> the runbook for reproducing the wrapper and shipping updates.

## Prerequisites

- [ ] macOS with Xcode (current release) + Command Line Tools.
- [ ] Apple Developer Program membership ($99/yr), with a signing team.
- [ ] App icons and screenshots at Apple's required sizes.

## Build & wrap

- [ ] `yarn build:safari` → `apps/extension/.output/safari-mv3/` (manifest drops
      `downloads`/`offscreen` + optional `notifications`/DNR; the platform seam
      handles the fallbacks).
- [ ] `./apps/safari-native/convert.sh` → generates the Xcode project under
      `apps/safari-native/` via `safari-web-extension-converter`.
- [ ] Open the project in Xcode, set the signing team, build, and run. Enable the
      extension in Safari → Settings → Extensions (Develop → Allow Unsigned
      Extensions for local testing).

## Verify the degraded behavior in Safari

- [ ] Collect + preview media on a page (should match other browsers).
- [ ] Single/save download works via the anchor-blob fallback.
- [ ] The "Capture video streams" toggle is **hidden** (no offscreen).
- [ ] No "Retry w/ referer" affordance (no dynamic DNR).
- [ ] Download History / on-disk dedupe are absent or degraded (no `downloads`
      API) — confirm the UI doesn't present broken controls.

## App Store listing

- [ ] App name, subtitle, description — **be explicit about the Safari limits**
      (single/save-as downloads; no bulk queue, on-disk dedupe, or stream capture)
      so the listing doesn't over-promise the Chromium/Firefox feature set.
- [ ] Privacy: network-free by default; the opt-in original-resolution fetch is
      the only external request (mirror `PRIVACY.md`).
- [ ] Screenshots at required macOS sizes.

## Permission justifications (for App Store review)

The Safari build requests a **reduced** permission set — `wxt.config.ts` drops
`downloads`/`downloads.open`, `offscreen`, and the optional `notifications` /
`declarativeNetRequestWithHostAccess` for Safari; the `@mbd/platform` seam supplies
the fallbacks. What actually ships (verify against
`apps/extension/.output/safari-mv3/manifest.json`): `storage`, `tabs`,
`contextMenus`, and host `<all_urls>`.

**storage** — keeps the user's own preferences and local library (download history,
favourites, excluded sources) on the device via the extension storage API. No
content is transmitted.

**tabs** — reads the active tab's URL and title to (1) label a saved file with the
page it came from and (2) open a media item's source page when the user asks. No
browsing history is collected or sent.

**contextMenus** — adds right-click actions ("Download all media on this page";
on a media element, "Download this media", "Download image (original quality)",
"Add image to Favourites") so the user can act without opening the popup.

**Host access — `<all_urls>`** — the extension must read the media elements on
whatever page the user runs it on, which can be any site; it activates only when
the user opens the popup or the on-page panel. When the optional "resolve
originals" setting is on, it fetches a higher-resolution version of a downloaded
item directly from that media's own CDN. It does not read or transmit page content
for any other purpose. **This is the permission Apple review most often asks about**
(see Submit, below) — justify it as "read media on any page the user chooses to
download from".

**Not requested on Safari** — nothing to justify for these; they are absent from
the Safari manifest: `downloads`/`downloads.open` (saving uses an anchor/blob
fallback, no downloads API), `offscreen` (no HLS/DASH stream capture),
`notifications`, and `declarativeNetRequestWithHostAccess` (no "retry with referer").

> **Content scripts.** The manifest declares an ISOLATED-world page collector
> (`<all_urls>`) plus six MAIN-world media sniffers (one `.m3u8`/`.mpd` manifest
> sniffer on `<all_urls>`; five host-scoped to `instagram.com`, `x.com` +
> `twitter.com`, `facebook.com`, `pinterest.com`, `mangadex.org`). **On Safari
> these sniffers are inert — collection is DOM-only** — and each would in any case
> read only request URLs the page already loaded and send nothing off-device. They
> are manifest keys, not extra permissions, covered by the `<all_urls>`
> justification above.

## Submit

- [ ] Archive in Xcode (Product → Archive) → Distribute App → App Store Connect.
- [ ] Complete App Store Connect metadata, upload build, submit for review.
- [ ] Respond to review (Apple often asks about `<all_urls>` host access — justify
      it as required for "download media from any page").

## Open decisions (from #307)

- macOS only, or iOS/iPadOS too? (iOS multiplies UX work — no context menus, touch.)
- Is the degraded single-file download an acceptable Safari experience to ship,
  or hold Safari until (if ever) Apple ships `browser.downloads`?
