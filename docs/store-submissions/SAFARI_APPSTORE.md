# Safari — App Store submission

Safari Web Extensions are distributed as a native macOS (and optionally iOS) app
that hosts the extension, submitted through the **Mac App Store**. This is a
different pipeline from the Chrome/Edge/Firefox/Opera zip uploads.

> Status: the extension **code** targets Safari (`yarn build:safari` +
> `apps/safari-native/`), but the native wrapper, signing, and submission require
> **macOS + Xcode + an Apple Developer account** and have not been run. Treat
> this as the runbook, not a completed release.

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

## Submit

- [ ] Archive in Xcode (Product → Archive) → Distribute App → App Store Connect.
- [ ] Complete App Store Connect metadata, upload build, submit for review.
- [ ] Respond to review (Apple often asks about `<all_urls>` host access — justify
      it as required for "download media from any page").

## Open decisions (from #307)

- macOS only, or iOS/iPadOS too? (iOS multiplies UX work — no context menus, touch.)
- Is the degraded single-file download an acceptable Safari experience to ship,
  or hold Safari until (if ever) Apple ships `browser.downloads`?
