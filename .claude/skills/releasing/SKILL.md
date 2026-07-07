---
name: releasing
description: Cut a release and publish this extension to the Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons (AMO). Use when bumping the version, packaging store zips, updating listing/store metadata, or asked "how do I ship / publish / release a new version".
---

# Releasing & publishing

One version bump propagates everywhere: WXT writes `package.json`'s `version`
into every browser's manifest.

## Steps

1. Update `CHANGELOG.md` (move `[Unreleased]` items under the new version).
2. Bump `version` in `package.json` (semver).
3. Package all stores:
   ```bash
   corepack yarn zip:all
   ```
   Produces in `.output/`:
   - `media-bulk-downloads-<version>-chrome.zip`
   - `media-bulk-downloads-<version>-edge.zip`
   - `media-bulk-downloads-<version>-firefox.zip` **+** `-sources.zip`
4. Validate the Firefox build: `corepack yarn lint:firefox` (web-ext, expect 0 errors).
5. Upload:
   - **Chrome Web Store** → [Developer Dashboard](https://chrome.google.com/webstore/devconsole), the `-chrome.zip`.
   - **Edge Add-ons** → [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge), the `-edge.zip` (same Chromium package family; the CWS copy/justifications apply).
   - **Firefox (AMO)** → [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), the `-firefox.zip` plus the `-sources.zip` when prompted (AMO requires source for bundled add-ons).
6. Tag the release in git.

## Store listing assets & copy

The full submission package — paste-ready name/summary/description, category,
per-permission justifications, privacy/data disclosures, screenshot specs — lives
in `docs/store-submissions/CHROME_WEBSTORE.md`. Privacy policy: `PRIVACY.md` (hosted at the repo's
public URL). Screenshots: 1280×800 or 640×400, 24-bit PNG, no alpha (there's a
`assets/screenshot-1280x800.png`). Other Chromium browsers (Brave/Opera/Vivaldi)
use the Chrome zip.

## References

- Submission package (this repo) — `docs/store-submissions/CHROME_WEBSTORE.md`, `PRIVACY.md`, `CHANGELOG.md`
- WXT publishing / zip — https://wxt.dev/guide/essentials/publishing
- Chrome Web Store publishing — https://developer.chrome.com/docs/webstore/publish
- Edge Add-ons submission — https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension
- Firefox AMO submission — https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- Semantic Versioning — https://semver.org/
