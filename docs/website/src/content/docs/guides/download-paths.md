---
title: "Download paths (folder templates)"
description: "Per-site folder templates using the {host}, {domain}, {date}, and {kind} tokens, plus the path-safety rules."
---

The **Save to subfolder** setting is a path template. Type a plain folder name, token placeholders, or both. The extension expands the tokens for each download and saves the file there. This gives you
one folder per site, per-day folders, or per-kind folders with no per-site setup.

## The one constraint

Everything you configure sits inside the browser's Downloads folder.
`chrome.downloads.download({ filename })` only accepts a path relative to that folder. It rejects absolute paths and `..`.

```
~/Downloads / <your template expands here> / image_1.jpg
└ fixed root ┘ └──────── you control this ───────┘
  (browser)          (the template)
```

To move the root, change the download location in the browser's own settings. The extension can't set it.

## Tokens

Four tokens exist. Anything else in `{...}` is dropped.

| Token      | Expands to                                     | Example           |
|------------|------------------------------------------------|-------------------|
| `{host}`   | the source page's full hostname                | `www.twitter.com` |
| `{domain}` | the registrable domain (drops `www.` and subs) | `twitter.com`     |
| `{date}`   | the download date, `YYYY-MM-DD`, local time    | `2026-07-13`      |
| `{kind}`   | the media kind: `image`, `video`, or `audio`   | `image`           |

## Examples

Source page `https://www.twitter.com/...`, first JPEG in the batch, default
`image_` prefix:

| Template          | Saved as                                       |
|-------------------|------------------------------------------------|
| *(empty)*         | `Downloads/image_1.jpg`                        |
| `Media`           | `Downloads/Media/image_1.jpg`                  |
| `{domain}`        | `Downloads/twitter.com/image_1.jpg`            |
| `Media/{domain}`  | `Downloads/Media/twitter.com/image_1.jpg`      |
| `{domain}/{date}` | `Downloads/twitter.com/2026-07-13/image_1.jpg` |
| `{kind}/{domain}` | `Downloads/image/twitter.com/image_1.jpg`      |

The Settings panel shows a live preview against a sample site as you type.

## How a template expands

`expandPathTemplate(template, tokens)` runs three steps (`packages/core/src/collection/paths.ts`):

1. Replace each known token with its value. The value first goes through
   `toSegment` — `sanitizePathSegment` plus stripping every `/`. A token value is always one segment, so a value that contains a slash can't add folders.
2. Delete any leftover `{...}`. An unknown token like `{typo}` is removed, not written literally.
3. Run the whole joined path through `sanitizePathSegment`.

Then `buildDownloadFilename` joins the result with the filename (`packages/core/src/collection/download-name.ts`).

### Worked example

Template `Media/{domain}/{date}`, download from
`https://www.twitter.com/user/status/1`, first image in the batch:

- `{host}` → `www.twitter.com`
- `{domain}` → `twitter.com`
- `{date}` → `2026-07-13`
- `{kind}` → `image`

Step 1 fills the tokens: `Media/twitter.com/2026-07-13`. Step 2 finds no unknown tokens. Step 3 leaves the path unchanged. The filename is `image_1.jpg`. Final path:

```
Downloads/Media/twitter.com/2026-07-13/image_1.jpg
```

## What sanitizePathSegment does

`sanitizePathSegment` (`packages/core/src/collection/paths.ts`) is what makes the constraint hold. For each `/`-separated segment it:

- Removes characters illegal in filenames: `< > : " | ? *` and control characters (`\x00`–`\x1f`).
- Converts `\` to `/`, then splits on `/`.
- Trims trailing dots and spaces from each part. Windows strips those when it resolves a path, so `.. ` could otherwise turn back into `..`. Trimming first closes that gap.
- Drops empty parts, `.`, and `..`. This is why traversal can't escape
  `Downloads/`: `../../etc` becomes `etc`, and a leading `/` is dropped.
- Prefixes Windows reserved device names with `_`, so `CON`, `PRN`, `AUX`,
  `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9` (with or without an extension) become ordinary folders like `_CON`.
- Caps each segment at 200 characters, keeping a short trailing extension. A crafted 10-KB name can't break the download.

## Rules and edge cases

- **`{host}` vs `{domain}`** — `www.twitter.com`, `m.twitter.com`, and
  `twitter.com` are three hosts but one domain. Use `{domain}` to group a site's subdomains. `registrableDomain` drops `www.` and subdomains against a small built-in set of two-part suffixes (`co.uk`,
  `com.au`, and a handful more). It is a heuristic, not a full public-suffix list.
- **Unknown site** — a file opened directly has no source page, so `{host}` and
  `{domain}` resolve to empty. The empty segment collapses. `Media/{domain}`
  saves to `Downloads/Media/...`, never an empty or `unknown` folder.
- **Name collisions** — the download call passes `conflictAction: 'uniquify'`, so a clash appends ` (1)`. Per-site folders make clashes rarer.

## Implementation

- `expandPathTemplate(template, tokens)` — token substitution plus sanitizing (`packages/core/src/collection/paths.ts`).
- `hostFromUrl`, `registrableDomain`, `todayISO` — token-value helpers (same file).
- `buildDownloadFilename(image, index, settings, sourcePageUrl?)` — resolves the tokens against the source page and prepends the folder (`packages/core/src/collection/download-name.ts`).
  `downloadAndRecord` threads the source URL in.
- The default `downloadPath` is `''` (`packages/storage/src/settings.ts`), stored in `chrome.storage.sync` under the `settings` key.

## Back-compatibility

A template with no tokens behaves like the old static subfolder. An existing
`downloadPath` of `Media` keeps saving to `Downloads/Media/`. No migration.

---

