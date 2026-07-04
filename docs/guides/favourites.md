# Favourites

Star any collected item to a personal **Favourites** list that survives across
pages and sessions — a bookmark for media.

## Using it

- **Star** an item from its grid tile (hover → ★) or from the preview modal. A
  filled-star badge marks already-saved items, even after a rescan or restart.
- Open the **Favourites** panel from the ★ button in the header.
- Each row offers **Download**, **Open source**, and **Remove**; the header has
  **Clear all**.
- **Download** re-downloads through the normal [Download](./download.md) flow:
  it sends `DOWNLOAD_IMAGES` with an `ImageInfo` synthesized from the stored
  `FavouriteEntry` (`src`, `kind`, `type`, `thumbnailSrc`) plus the entry's
  saved `sourcePageUrl`/`sourcePageTitle` as `sourcePage` — which is why your
  download-path tokens (`{host}`/`{domain}`/`{date}`/`{kind}`) still apply, the
  same as any first-time download.

## How it works

- Stored in `chrome.storage.local` under the `favourites` key, deduped by media
  URL, newest-first, capped at 500.
- Mutations route through the background service worker (a single writer) via
  three messages — `ADD_FAVOURITE`, `REMOVE_FAVOURITE`, `CLEAR_FAVOURITES` —
  and every open surface (popup + on-page bubble) stays in sync via
  `chrome.storage.onChanged`.
- Favourites are independent of [Download History](./history.md) — an item can
  be both.

## Star click → single writer → multi-surface sync

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant P as Popup / Bubble (App)
  participant SW as background.ts
  participant F as addFavourite (favourites.ts)
  participant ST as chrome.storage.local
  participant P2 as Other open surface

  U->>P: click ★ on a tile
  P->>SW: sendMessage({ type:"ADD_FAVOURITE", entry })
  SW->>F: addFavourite(entry)
  F->>F: mergeFavourites(existing, [entry])<br/>dedup by src · newest-first · cap 500
  F->>ST: storage.local.set({ favourites: merged })
  ST-->>P: storage.onChanged (area:"local")
  ST-->>P2: storage.onChanged (area:"local")
  P->>P: reconcile favouriteSrcs → ★ fills in
  P2->>P2: reconcile favouriteSrcs → ★ fills in there too
```

`REMOVE_FAVOURITE` and `CLEAR_FAVOURITES` follow the identical single-writer →
`storage.onChanged` path — only the mutation inside `favourites.ts` differs.

Implementation: `src/extension/shared/favourites.ts`,
`src/extension/popup/components/FavouritesPanel.tsx`, and the star controls in
`src/extension/popup/components/ImageList.tsx`.

See also: [Download](./download.md) · [Download History](./history.md) ·
[Architecture](./architecture.md).
