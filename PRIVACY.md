# Privacy Policy — Media Bulk Downloads

_Last updated: 2026-07-04_

Media Bulk Downloads ("the extension") is a browser extension that finds images,
video, and audio on the web page you are viewing and lets you preview, filter,
and download them.

## Summary

**The extension does not collect, store off your device, transmit, or sell any
personal information.** All of its work happens locally in your browser.

## What the extension accesses

- **The content of the page you are actively using.** When you open the popup or
  the on-page panel, the extension reads the page's media elements (image, video,
  and audio URLs and their dimensions/types) so it can list them. This runs on the
  page you choose to use it on; it is not sent anywhere.
- **The active tab's URL and title.** Used only to label a download with the page
  it came from (shown in your local download history) and, when you click "Open
  source", to open that URL in a new tab.

## What the extension stores (locally, on your device)

- **Your settings** — via `chrome.storage.sync` (so they follow your Chrome
  profile). No content, only preferences.
- **Your download history** — via `chrome.storage.local`. A list of files you
  downloaded through the extension (filename, source page, timestamp, thumbnail
  URL). It never leaves your device and you can clear it at any time from the
  History panel.

This data stays on your device (and, for settings, within your own Chrome sync
account). The extension has no server and no analytics.

## Network requests

By default the extension is **network-free** — it only reads what the page has
already loaded and hands URLs to Chrome's download manager.

One **optional, off-by-default** setting, "Resolve exact originals", makes direct
requests to the media's own content-delivery network (for example Twitter,
Wallhaven, or Unsplash) to fetch a higher-resolution version of an item you are
downloading. These requests go only to those media hosts, carry no identifying
information beyond what a normal browser request to that host would, and happen
only while you are downloading and only when you have enabled the setting.

## Permissions

See the extension's Chrome Web Store listing for a plain-language justification of
each permission. In short: `downloads`/`downloads.open` save and open your files,
`storage` keeps your settings and history on your device, `tabs` labels downloads
with their source page, and host access lets the extension read media on the page
you are using.

Two permissions are **optional** and requested only when you turn the matching
feature on, never at install: `notifications` (a local desktop toast when a
download batch finishes) and `declarativeNetRequestWithHostAccess` (used only if you choose
"Retry with page referer" on a download a site blocked with HTTP 403 — it sets
that one request's `Referer`/`Origin` to the item's own source page so the file
downloads, then removes the rule). Both act entirely on your device; neither sends
any data off it.

## Data sharing

None. No data is sold, rented, or shared with any third party. No data is used for
advertising, creditworthiness, or any purpose unrelated to the single purpose
above.

## Contact

Questions about this policy: mrabir.ahamed@gmail.com
