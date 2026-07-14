# apps/safari-native — Safari Web Extension wrapper

Safari Web Extensions ship **inside a native macOS/iOS app**. The extension code
is the same `@mbd/extension` build (`-b safari`); this directory holds the native
Xcode wrapper that hosts it. The wrapper is **generated on macOS** by Apple's
`safari-web-extension-converter` — it is not committed here because it must be
produced (and re-produced) against a specific Xcode toolchain.

## Prerequisites (macOS only)

- macOS with **Xcode** (Command Line Tools installed).
- An **Apple Developer account** ($99/yr) for signing + App Store submission.
- The extension built for Safari: from the repo root, `yarn build:safari`
  (emits `apps/extension/.output/safari-mv3/`).

## Generate the wrapper

```bash
# from the repo root, on macOS:
yarn build:safari
./apps/safari-native/convert.sh
```

`convert.sh` runs `safari-web-extension-converter` against the Safari build,
producing an Xcode project under `apps/safari-native/MediaBulkDownloads/`. Open
it in Xcode, set your signing team, and run to load the extension in Safari
(enable it in Safari → Settings → Extensions, with "Allow unsigned extensions"
from the Develop menu for local testing).

## What differs on Safari (handled by the code)

The extension detects Safari at build time (`import.meta.env.BROWSER === 'safari'`)
and routes browser-divergent APIs through the `@mbd/platform` seam
(`apps/extension/src/extension/platform/safari.ts`):

| Capability | Safari behavior |
|---|---|
| Downloads | anchor-blob (`fetch` → `<a download>`); no subfolders, no on-disk dedupe, no progress, no reveal |
| Notifications | in-popup toast (no `chrome.notifications`) |
| Header rules (hotlink retry) | unavailable (no dynamic DNR `modifyHeaders`) |
| Stream capture | runs in the DOM-capable background page (no `chrome.offscreen`) |

The Safari manifest (via `wxt.config.ts`) drops the `downloads` and `offscreen`
permissions and the optional `notifications`/`declarativeNetRequestWithHostAccess`.

## Known limitations on Safari (not compensated)

Unlike the differences above, these are Safari platform gaps the extension
degrades around rather than routing through the seam:

- **MAIN-world sniffers don't inject.** `world: "MAIN"` content scripts are
  unsupported by the current Safari (`safari-web-extension-converter` warns:
  *"the following keys in your manifest.json are not supported … `world`"*). The
  five passive network sniffers (`fb` / `hls` / `ig` / `pinterest` /
  `x-media-sniffer`) rely on MAIN-world injection to observe the page's own
  GraphQL / `.m3u8` requests. On Safari they are inert, so Instagram / Facebook
  full-resolution capture, HLS-via-player detection, and X / Pinterest / Threads
  sniffing fall back to **DOM-only** collection — the same reduced coverage as
  running with sniffers off. No error; just fewer / lower-resolution results on
  those sites.

## Distribution

See [`docs/store-submissions/SAFARI_APPSTORE.md`](../../docs/store-submissions/SAFARI_APPSTORE.md).
