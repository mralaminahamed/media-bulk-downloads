# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cross-browser builds** — migrated the build to [WXT](https://wxt.dev), which
  produces Chrome, Firefox (MV3, 109+), and Edge packages and store-ready zips
  from one codebase (`yarn zip:all`).
- On-page bubble: a theme-aware page dim behind the open panel (visual only) so
  it reads clearly on light pages.
- Download history: per-entry **Open source**, **Open file**, and **Show in
  folder** actions (`downloads.open` permission).
- Chrome Web Store submission package (`docs/CHROME_WEBSTORE.md`) and privacy
  policy (`PRIVACY.md`).
- Community health files: contributing guide, security policy, code of conduct,
  changelog, issue/PR templates.

### Changed
- Redesigned the extension icon: a solid indigo brand tile with a photo glyph and
  download arrow, legible down to 16px (the old thin-line outline washed out at
  toolbar size).
- Build tooling: replaced Vite + `@crxjs/vite-plugin` (and the custom Firefox
  adapter script) with WXT; output moved from `dist/`/`release/` to `.output/`.
- Popup UX pass: theme-correct modal/thumbnail scrims and control rings for dark
  mode, WCAG-AA data contrast, unified modal accessibility (focus trap, Escape,
  dialog roles) via a shared `useDialog` hook, tokenized radii/icon/button
  scales, and kind-agnostic preview copy.
- Settings validation: field helpers, dirty-gated Save, Escape-to-close, number
  clamping, and hiding the file-name prefix in Original naming mode.

### Fixed
- Twitter/X GIF thumbnails served without a path extension are now collected as
  downloadable video instead of leaking as a still image.

## [1.0.0]

### Added
- Collect images, video, and audio from any page — including lazy `data-*`
  attributes, `srcset`, `<picture>`, CSS backgrounds, `<noscript>`, gallery
  links, and `<video>`/`<audio>` sources.
- Original-quality upgrades: de-proxying wrapped URLs and rewriting CDN
  thumbnails to full size, with an opt-in network resolver for exact originals.
- Deep scan: bounded auto-scroll to surface virtualized / infinite-scroll media.
- Filter by kind, format, and size; download one item or the whole filtered set
  with kind-correct extensions, a configurable subfolder, and naming options.
- Optional on-page bubble in an isolated Shadow DOM.
- Network-free by default; settings and download history stored locally.

[Unreleased]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mralaminahamed/media-bulk-downloads/releases/tag/v1.0.0
