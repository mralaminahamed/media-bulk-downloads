# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Download-path templates: the **Save to subfolder** setting now accepts
  `{host}`, `{domain}`, `{date}`, and `{kind}` tokens, so downloads can be
  organized into per-site (and per-day / per-kind) folders automatically — e.g.
  `Media/{domain}` saves each site to its own folder. A template with no tokens
  behaves exactly as the old static subfolder did. See
  [docs/guides/download-paths.md](docs/guides/download-paths.md).
- Favourites: star any image, video, or audio item to a personal **Favourites**
  list that persists across pages and sessions. Star from the grid tile or the
  preview; a filled-star badge marks saved items. A new Favourites panel lists
  them with **Download**, **Open source**, and **Remove** (plus **Clear all**),
  and re-downloads through the normal flow (so download-path tokens still apply).
  Stored locally, capped at 500. See [docs/guides/favourites.md](docs/guides/favourites.md).

### Changed
- Unified the in-app brand mark with the installed toolbar icon. The popup
  header and the on-page bubble launcher now render the actual icon artwork
  from a single shared `BrandMark` component (per-instance gradient IDs), so
  they can no longer drift from the icon users see in the browser — replacing
  the old, mismatched line glyph.

## [1.0.0] - 2026-07-04

Initial public release.

### Added
- Collect images, video, and audio from any page — including lazy `data-*`
  attributes, `srcset`, `<picture>`, CSS backgrounds, `<noscript>`, gallery
  links, and `<video>`/`<audio>` sources.
- Original-quality upgrades: de-proxying wrapped URLs and rewriting CDN
  thumbnails to full size, with an opt-in network resolver for exact originals.
- Deep scan: bounded auto-scroll to surface virtualized / infinite-scroll media.
- Filter by kind, format, and size; download one item or the whole filtered set
  with kind-correct extensions, a configurable subfolder, and naming options.
- Download history with per-entry **Open source**, **Open file**, and **Show in
  folder** actions (`downloads.open` permission).
- Optional on-page bubble in an isolated Shadow DOM, with a theme-aware page dim
  behind the open panel (visual only) so it reads clearly on light pages.
- **Cross-browser builds** via [WXT](https://wxt.dev): Chrome, Firefox (MV3,
  109+), and Edge packages and store-ready zips from one codebase (`yarn zip:all`).
- Network-free by default; settings and download history stored locally.
- Chrome Web Store submission package (`docs/CHROME_WEBSTORE.md`), privacy policy
  (`PRIVACY.md`), and community health files (contributing guide, security
  policy, code of conduct, issue/PR templates).

### Design & quality
- Solid indigo brand icon (photo glyph + download arrow), legible down to 16px.
- Popup UX: theme-correct modal/thumbnail scrims and control rings for dark mode,
  WCAG-AA data contrast, unified modal accessibility (focus trap, Escape, dialog
  roles) via a shared `useDialog` hook, tokenized radii/icon/button scales, and
  Tailwind v4 CSS-variable utilities.
- Settings validation: field helpers, dirty-gated Save, Escape-to-close, number
  clamping, and hiding the file-name prefix in Original naming mode.

### Fixed
- Twitter/X GIF thumbnails served without a path extension are collected as
  downloadable video instead of leaking as a still image.

[Unreleased]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mralaminahamed/media-bulk-downloads/releases/tag/v1.0.0
