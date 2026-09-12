---
title: "Shortcuts & context menu"
description: "Keyboard shortcuts and right-click menu items for opening the popup, downloading media, and adding favourites."
---

You don't have to open the popup to use the extension. There are keyboard
shortcuts for the two most common actions, and a right-click menu for saving one
item or a whole page at a time.

## Keyboard shortcuts

| Action | Default (Windows/Linux) | Default (macOS) |
|--------|-------------------------|-----------------|
| Open Media Bulk Downloads | `Ctrl+Shift+M` | `Command+Shift+M` |
| Download all media on the current page | `Ctrl+Shift+Y` | `Command+Shift+Y` |

The download shortcut collects the current page's media, saves everything
eligible under your settings, and captures any HLS or DASH streams if stream
capture is on. Because no popup is open to show progress, it can show a desktop
notification with the result when **Settings → Downloads → Advanced → Notify when
downloads finish** is on.

### Rebinding a shortcut

The defaults are suggestions, and the browser may not assign one if it clashes
with something else. To change or set a shortcut, open `chrome://extensions/shortcuts`
(on Edge, `edge://extensions/shortcuts`) and edit the entry for Media Bulk
Downloads. Firefox has the same list under its Add-ons manager. This is the
browser's own settings page, not part of the extension.

## Right-click menu

Right-click on a page or a media element and the extension adds items to the
context menu, depending on what you clicked:

| Menu item | Appears on | What it does |
|-----------|------------|--------------|
| Download all media on this page | Anywhere on the page | Collects the page's media and downloads everything eligible, the same as the download shortcut. |
| Download image (original quality) | An image | Downloads that image, upgraded to its original quality where the site's rules allow. |
| Add image to Favourites | An image | Saves that image to your Favourites. |
| Download this media | A video or audio element | Downloads that video or audio file. |

A few notes:

- **Download all media on this page** works only on ordinary http(s) pages. A
  restricted page (a browser settings page or the web store) has no content
  script, so there is nothing to collect.
- **Download image (original quality)** applies the same original-resolution
  upgrade the popup uses, so a right-clicked thumbnail can save at full size. See
  [Resolve Originals](/media-bulk-downloads/how-it-works/resolve-originals/).
- Only real http(s) media is downloadable this way. Inline `data:` and `blob:`
  sources are skipped.

## Example: save a single image at full size

1. Right-click the image on the page.
2. Choose **Download image (original quality)**. The extension upgrades the URL
   where it can and saves the file to your Downloads folder.
3. To save the whole page instead, right-click anywhere and choose **Download all
   media on this page**, or press the download shortcut.

## Related

- [Download](/media-bulk-downloads/guides/download/) for how saved files are named and de-duplicated.
- [Favourites](/media-bulk-downloads/guides/favourites/) for what the favourites list holds.
- [FAQ & troubleshooting](/media-bulk-downloads/help/faq/) for downloads that don't appear.

---
