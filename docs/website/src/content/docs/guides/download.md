---
title: "Download"
---

Everything you save goes through the service worker, which owns
`chrome.downloads`. The popup and the in-page bubble never call it directly.

There are two save paths, and they behave differently:

- **Bulk download** from the popup or bubble grid sends a `DOWNLOAD_IMAGES`
  message. The worker hands the batch to a **persistent download queue** and records history when each file actually finishes.
- **The keyboard command and the right-click menu** call `downloadAndRecord`, which fires `chrome.downloads` directly and records history on dispatch. This path shows a desktop toast, because usually
  no popup is open to show status.

Both paths share the same filename builder and the same duplicate handling, described first.

## Naming a file (`buildDownloadFilename`)

`buildDownloadFilename(image, index, settings, sourcePageUrl?)` returns a **relative** path — a folder template plus a filename — that
`chrome.downloads` saves inside `Downloads/`. It lives in `packages/core` so the queue, the direct path, and the ZIP builder all produce identical names and folders.

### The extension (`downloadExtension`)

1. If the item already carries an extension (`image.ext`), use it. The resolver that built the item reports the real one — Wallhaven `.jpg`, Twitter's
   `format`, the generic resolver's URL extension — so the download keeps the source's spelling. This check runs first for images and for video/audio.
2. Image with no `image.ext`: `extensionForType(type)`. `jpeg` becomes `jpg`;
   `png` / `gif` / `webp` / `svg` / `avif` / `bmp` / `ico` pass through; anything else falls back to `jpg`.
3. Video/audio with no `image.ext`: `avExtensionForType(type)` (mp4/webm/mov/…, mp3/wav/flac/…), then the URL's path extension, then `mp4` for video / `mp3`
   for audio as a last resort.

### The name (`namingMode`)

- **`prefixed`** (default): `<fileNamePrefix><n>.<ext>`, where `n` is the item's 1-based position in the batch — `image_1.jpg`, `image_2.png`. A blank prefix falls back to `image_`.
- **`original`**: the source URL's basename, with the extension re-derived as above — `sunset.jpg`. Falls back to the prefixed form when the URL has no usable name: `data:` / `blob:` URIs, or a path
  that ends in a slash or has no basename.

### The folder

`buildDownloadFilename` prepends the expanded `downloadPath` template. This is how you get one folder per site, per day, or per media kind. The tokens (`{host}` `{domain}` `{date}` `{kind}`) and the
safety rules that keep a path inside `Downloads/` are documented in
[Download paths](./download-paths.md) — not repeated here.

### Settings that shape a download

| Setting                  | Default    | Effect                                                               |
|--------------------------|------------|----------------------------------------------------------------------|
| `namingMode`             | `prefixed` | Keep the source name (`original`) or use `fileNamePrefix` + index    |
| `fileNamePrefix`         | `image_`   | Prefix for the `prefixed` form                                       |
| `downloadPath`           | *(empty)*  | Relative folder template — see [Download paths](./download-paths.md) |
| `saveAs`                 | `false`    | Show Chrome's native "Save As" dialog for each file                  |
| `skipDuplicateDownloads` | `true`     | Skip items already saved and still on disk (see below)               |
| `notifyOnComplete`       | `false`    | Desktop toast when a command / right-click batch finishes            |
| `downloadConcurrency`    | `5`        | How many queued files download at once                               |

`conflictAction: 'uniquify'` is **not** a setting. It is set on every
`chrome.downloads.download` call as a backstop (see the next section).

## Skipping duplicates and de-colliding names

Two independent steps run before any download starts.

**Skip files already on disk.** When `skipDuplicateDownloads` is on (and the download is not an explicit re-download), `partitionByDownloaded` splits the batch into `keep` and `skipped` by canonical
src key. The "already downloaded"
set comes from `downloadedOnDiskKeys()`: it loads the download history and runs one `chrome.downloads.search({ limit: 0 })` (no row cap, so a heavy downloader's older entries aren't dropped and
re-offered), then keeps only the entries whose file still exists. Any error yields an empty set, so a dedup hiccup never blocks a download. Skipped items are counted, not saved.

**De-collide within the batch.** `uniquifyBatchNames` walks the built relative paths; when two distinct items derive the same path, it inserts `-2`, `-3`, … before the basename's extension
(`image.png`, `image-2.png`), keeping the directory. Matching is case-insensitive (Windows/macOS). This is why you never see Chrome's " (2)" *within* one batch.

`conflictAction: 'uniquify'` is the cross-batch backstop: a name that clashes with a file from an earlier batch still gets Chrome's " (1)".

## Bulk download: the queue (`DOWNLOAD_IMAGES`)

The popup and bubble grid send `DOWNLOAD_IMAGES { images, sourcePage,
explicit? }`. The handler:

1. Awaits `settingsReady` and `excludedReady` (see the gate below).
2. Picks the eligible set. An **explicit** re-download (from History or Favourites) is used as-is. Any other batch is re-filtered through
   `filterImagesBySettings` + `filterExcluded` — the same rule that drives the badge and the visible grid.
3. Skips on-disk duplicates, unless the download is explicit or
   `skipDuplicateDownloads` is off.
4. Builds and de-collides the filenames.
5. Calls `enqueueDownloads`, which appends the items to the persistent queue in
   `storage.local`. The worker's dispatcher pumps them `downloadConcurrency` at a time through `chrome.downloads.download`.
6. Records each file to history **when it completes** (`onChanged` → `complete`), tagged with its source page and real `downloadId`. Nothing is recorded at enqueue time.
7. Replies with the queued count: `Queued N downloads`,
   `Nothing new — N already saved.` (every item was a duplicate), or
   `No files to download.`

A failed download is retried with backoff rather than dropped; a `403` can arm an optional Referer-rewrite retry when the user has opted in. Progress and retries are visible in the popup's queue
panel.

## Command and right-click: `downloadAndRecord`

The `download-all-media` keyboard command and the "Download all" /
"Download image/media" context-menu items bypass the queue. `downloadAndRecord`:

1. Skips on-disk duplicates for "Download all" (when
   `skipDuplicateDownloads` is on). A single right-click download never skips — the user picked that exact item.
2. Builds and de-collides the filenames.
3. Fires `chrome.downloads.download` for every item.
4. Records the successes to history immediately (each already carries its
   `downloadId`). A Chrome `lastError` or a missing `downloadId` counts as a failure — dropped, not recorded.
5. Calls `notifyBatchDone`. If `notifyOnComplete` is on and the optional
   `notifications` permission is granted, it shows a desktop toast — the only feedback when no popup is open. `downloadStatusMessage` builds the text:
   `Downloaded 5 files.`, `Downloaded 3 of 5 files — 2 failed.`,
   `Couldn't download 5 files.`, or `Nothing new — N already saved.`

**"Nothing new — N already saved"** means the batch had items but every eligible one was skipped as an on-disk duplicate, so nothing was queued or downloaded. The queue path shows the same wording as
its popup status.

## Archive, text, and converted downloads

The service worker has no `URL.createObjectURL`, so anything the popup builds in memory reaches `chrome.downloads` as a base64 `data:` URL. These three messages all honor `saveAs`; none go through the
queue.

- **`DOWNLOAD_ZIP`** — the popup fetches and zips the selected media in its own context (its `fetch` bypasses page CORS), names the entries with the same
  `buildDownloadFilename`, then sends the archive bytes plus a zip filename. The worker writes it and replies `Saved <name>.` / `Couldn't save <name>.` No per-file history is recorded. Items that
  couldn't be fetched fall back to a normal `DOWNLOAD_IMAGES` batch; if nothing could be fetched, the whole set falls back to per-file downloads.
- **`DOWNLOAD_TEXT`** — a text export (a URL list or a JSON backup). Written as a
  `data:` URL of the given MIME. Fire-and-forget, no history.
- **`DOWNLOAD_BYTES`** — convert-on-download. The popup re-encodes an image to PNG/JPEG via canvas and sends the bytes; the filename uses the converted extension. The worker records the **original**
  source src to history, so a converted file still gets the "already downloaded" mark and dedups like a plain download.

## The `settingsReady` gate

The service worker is ephemeral (MV3): a `DOWNLOAD_*` message can wake it, and that wake-up races the async `chrome.storage.sync` read of settings. If filtering or naming ran against
`DEFAULT_SETTINGS` in that window, a file could land in the wrong folder, use the wrong prefix, or skip the user's real size/base64 filters. Every download handler awaits `settingsReady` before it
filters, names, or reads
`saveAs` — and `DOWNLOAD_IMAGES` also awaits `excludedReady` — so a download that woke the worker always runs against the user's real settings.

## Notes

- Eligibility is re-checked in the worker via `filterImagesBySettings` +
  `filterExcluded`, so the same rule that drives the badge and the visible grid also gates every non-explicit download.
- Streaming (`.m3u8` / `.mpd`) and `blob:` media never reach `chrome.downloads`. HLS/DASH are captured (fetch + mux segments) and blobs are dropped at collection —
  see [Collection Pipeline](../how-it-works/collection-pipeline.md).
- Re-download from History or Favourites sends `DOWNLOAD_IMAGES` with
  `explicit: true`. The user picked those exact items, so the size/base64/exclude filters and the on-disk dedup skip are all bypassed; naming and folder tokens still apply.
  See [Download History](./history.md) and
  [Favourites](./favourites.md).
- One filename source of truth: `buildDownloadFilename` lives in `packages/core`, so the queue, the direct path, and the ZIP builder can never disagree on a name or folder.

---

**[← All guides](../getting-started/introduction.md)** · [Download paths](./download-paths.md) · [Download History](./history.md)
