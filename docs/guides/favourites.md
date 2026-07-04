# Favourites

Star any collected item to a personal **Favourites** list that survives across
pages and sessions — a bookmark for media.

## Using it

- **Star** an item from its grid tile (hover → ★) or from the preview modal. A
  filled-star badge marks already-saved items, even after a rescan or restart.
- Open the **Favourites** panel from the ★ button in the header.
- Each row offers **Download** (re-downloads through the normal flow, so your
  download-path tokens still apply), **Open source**, and **Remove**; the header
  has **Clear all**.

## How it works

- Stored in `chrome.storage.local` under the `favourites` key, deduped by media
  URL, newest-first, capped at 500.
- Mutations route through the background service worker (a single writer), and
  every open surface (popup + on-page bubble) stays in sync via
  `chrome.storage.onChanged`.
- Favourites are independent of Download History — an item can be both.

Implementation: `src/extension/shared/favourites.ts`,
`src/extension/popup/components/FavouritesPanel.tsx`, and the star controls in
`src/extension/popup/components/ImageList.tsx`.
