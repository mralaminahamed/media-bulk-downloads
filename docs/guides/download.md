# Download

Downloads run through the service worker, which owns `chrome.downloads`.

## Flow

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant P as Popup / Bubble (App)
  participant SW as background.ts
  participant F as filterImagesBySettings
  participant BN as buildDownloadFilename
  participant D as chrome.downloads

  U->>P: click ⬇ (single) or Download N (bulk)
  P->>SW: sendMessage({ type:"DOWNLOAD_IMAGES", images })
  SW->>F: filter by current settings (eligibility)
  loop each eligible item
    SW->>BN: buildDownloadFilename(item, index, settings)
    BN-->>SW: relative path + filename
    SW->>D: download({ url, filename, saveAs, conflictAction:"uniquify" })
  end
  SW-->>P: { status, message }
  P->>P: show status text
```

## Filename construction (`buildDownloadFilename`)

```mermaid
flowchart TB
  START["item, index, settings"] --> EXT{"item.kind"}
  EXT -->|image| IE["extensionForType(type)<br/>(default jpg)"]
  EXT -->|video/audio| AE["avExtensionForType(type)<br/>?? extensionFromUrl(src)<br/>?? mp4 / mp3"]
  IE --> NAME
  AE --> NAME
  NAME{"namingMode"}
  NAME -->|original| ON["originalNameFromUrl(src)<br/>+ .ext  (else prefix fallback)"]
  NAME -->|prefixed| PN["&lt;prefix&gt;&lt;index+1&gt;.ext"]
  ON --> DIR
  PN --> DIR
  DIR["prepend sanitized subfolder<br/>(settings.downloadPath)"] --> OUT["Downloads/&lt;folder&gt;/&lt;file&gt;"]
```

### Options (Settings)

| Setting | Effect |
|---------|--------|
| `namingMode: 'original'` | Keep the source file's name; falls back to the prefix form when the URL has no usable name (data/blob URIs, path with no basename) |
| `namingMode: 'prefixed'` | `fileNamePrefix` + sequential index |
| `downloadPath` | Sanitized relative subfolder inside `Downloads/` (MV3 has no native folder picker) |
| `saveAs: true` | Chrome's native "Save As" dialog per file |
| `conflictAction: 'uniquify'` | Chrome auto-dedups clashing names (always on) |

### Extension by kind

- **Image:** `extensionForType(type)` — `jpeg→jpg`, `png/gif/webp/svg/avif/bmp/ico`
  pass through, default `jpg`.
- **Video/Audio:** `avExtensionForType(type)` (mp4/webm/mov/…/mp3/wav/flac/…),
  then the URL's real extension, then `mp4`/`mp3` as a last resort.

## Notes

- Eligibility is re-checked in the worker via `filterImagesBySettings`, so the
  same rule that drives the badge and the visible list also gates downloads.
- Cross-origin URLs the server blocks fail via `chrome.downloads`; the error
  message is surfaced in the panel's status line.
- Streaming (`.m3u8`/`.mpd`) and `blob:` media never reach here — they're dropped
  at collection (see [Collection Pipeline](./collection-pipeline.md)).
