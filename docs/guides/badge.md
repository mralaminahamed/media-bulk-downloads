# Badge

The toolbar icon shows the count of **eligible** media on the active tab, kept in
sync by the service worker.

## Flow

```mermaid
sequenceDiagram
  autonumber
  participant CH as Chrome
  participant SW as background.ts
  participant CS as Content script
  participant F as filterImagesBySettings

  Note over CH,SW: tab activated or finished loading
  CH->>SW: tabs.onActivated / tabs.onUpdated(status:"complete")
  SW->>CS: sendMessage("GET_IMAGES")
  CS-->>SW: MediaItem[]
  SW->>F: filter by current settings
  F-->>SW: eligible count
  SW->>CH: action.setBadgeText({ text: count, tabId })
  SW->>CH: action.setBadgeBackgroundColor(BADGE_COLOR)

  Note over CH,SW: while a tab is loading
  CH->>SW: tabs.onUpdated(status:"loading")
  SW->>CH: setBadgeText("…", tabId)
```

## Behavior

- **Loading** tabs show `…` until the page settles, then the real count.
- The count uses the same `filterImagesBySettings` (minimum size + base64
  exclusion) that gates the visible list and downloads, so **badge = what the
  panel shows = what downloads**.
- If the content script can't run (e.g. `chrome://`, the Web Store, AMO),
  the `GET_IMAGES` message fails silently and the badge stays clear.

## Popup vs. bubble mode

The worker also decides what clicking the icon does, via `action.setPopup`, in
`updateTabActionMode`. Two gates must both pass for the bubble to take over —
the setting, **and** `isInjectableUrl(url)`:

```mermaid
flowchart LR
  S{"settings.bubbleEnabled?"} -->|no| POP["setPopup('popup.html')<br/>→ click opens the popup"]
  S -->|yes| I{"isInjectableUrl(url)?"}
  I -->|no, restricted page| POP
  I -->|yes| BUB["setPopup('')<br/>→ click fires action.onClicked<br/>→ TOGGLE_BUBBLE to content"]
```

`isInjectableUrl` (`apps/extension/src/extension/background/badge.ts`) passes only `http(s):` and
`file:` URLs, and explicitly rejects three store hosts even though they're
`https:`: `chromewebstore.google.com`, `chrome.google.com/webstore`, and
`addons.mozilla.org`. So even with the bubble enabled, those pages (and any
`chrome://`, `about:`, etc. page) fall back to the popup — it's the only
surface that works everywhere.

See [In-page Bubble](./bubble.md) for what `TOGGLE_BUBBLE` does.
