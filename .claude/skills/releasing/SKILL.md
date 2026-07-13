---
name: releasing
description: Cut a release and publish this extension to the Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons (AMO). Use when bumping the version, packaging store zips, updating listing/store metadata, tagging a release, working on the tag-triggered release.yml workflow, or debugging a Chrome Web Store API publish failure (unauthorized_client, invalid_grant, publisherId, Unauthorized). Covers the OAuth/credential setup the CWS publish needs.
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
   Produces in `apps/extension/.output/`:
   - `media-bulk-downloads-<version>-chrome.zip`
   - `media-bulk-downloads-<version>-edge.zip`
   - `media-bulk-downloads-<version>-firefox.zip` **+** `-sources.zip`
4. Validate the Firefox build: `corepack yarn lint:firefox` (web-ext, expect 0 errors).
5. Upload:
   - **Chrome Web Store** → [Developer Dashboard](https://chrome.google.com/webstore/devconsole), the `-chrome.zip`.
   - **Edge Add-ons** → [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge), the `-edge.zip` (same Chromium package family; the CWS copy/justifications apply).
   - **Firefox (AMO)** → [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), the `-firefox.zip` plus the `-sources.zip` when prompted (AMO requires source for bundled add-ons).
6. Tag the release: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
   The tag **must** equal `package.json`'s `version` (release.yml enforces this).

Convention here: bump version + CHANGELOG on a branch → PR → merge to main →
tag the merge commit. Manual store uploads (step 5) are still done by hand except
Chrome, which the tag can auto-publish (below).

## Automated release (`.github/workflows/release.yml`)

Pushing a `vX.Y.Z` tag runs three jobs:

- **validate** — lint / type-check / test.
- **release** — `yarn zip:all`, then a **GitHub Release** with all four zips
  attached and the matching `## [X.Y.Z]` CHANGELOG section as the body.
- **publish-chrome** — pushes the Chrome zip to the Web Store via Google's
  **official REST API with plain `curl`** (no npm package — the
  `chrome-webstore-upload-cli` path broke, see below). `workflow_dispatch`
  re-runs publish-chrome against the current `package.json` version without a new
  tag: `gh workflow run release.yml --ref <branch>`.

The GitHub Release always works; the Chrome publish depends on credentials being
right (below). Edge/Firefox/Opera stay manual — grab their zips from the Release.

## Chrome Web Store API publishing (the auth reality)

We call the API directly (`developer.chrome.com/docs/webstore/using-api`):

1. OAuth token: `POST https://oauth2.googleapis.com/token` with
   `client_id`/`client_secret`/`refresh_token`/`grant_type=refresh_token`.
2. Upload (**v1.1, item-scoped — needs only the item id, no publisher id**):
   `PUT https://www.googleapis.com/upload/chromewebstore/v1.1/items/<ITEM_ID>`,
   header `x-goog-api-version: 2`. Success ⇒ `uploadState: "SUCCESS"`.
3. Publish: `POST https://www.googleapis.com/chromewebstore/v1.1/items/<ITEM_ID>/publish`.

We deliberately use the **v1.1 item endpoint**, not the newer **v2
publisher-scoped** one (`chromewebstore.googleapis.com/upload/v2/publishers/<PUBLISHER_ID>/items/<ID>:upload`)
that `chrome-webstore-upload` v6 switched to — v2 adds a `publisherId` and a
publisher-authorization failure mode we don't need.

**Credential setup that actually works** (all three secrets must be a *matched
set from one client*): `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
`CHROME_REFRESH_TOKEN`, plus `CHROME_EXTENSION_ID`.
- The OAuth client must be type **"Web application"**, with redirect URI
  `https://developers.google.com/oauthplayground`.
- Enable the **Chrome Web Store API** in that Google Cloud project.
- Mint the refresh token in the [OAuth Playground](https://developers.google.com/oauthplayground/)
  (gear → use your own client id/secret) with scope
  `https://www.googleapis.com/auth/chromewebstore`, signed in as the account that
  **owns** the item.

### Error → cause

| Error (where) | Cause / fix |
|---|---|
| `Option "publisherId" is required` (cli) | `chrome-webstore-upload-cli@4` → lib v6 uses the v2 publisher-scoped API. We avoid it by calling v1.1 item-scoped with curl. |
| `invalid_grant` (token step) | Refresh token expired or revoked (test-mode-consent tokens expire fast). Regenerate it. |
| `unauthorized_client` (token step) | `CLIENT_ID`/`CLIENT_SECRET` don't match the client that issued the refresh token, **or** the client isn't a "Web application". Regenerate all three as a matched set from one Web-application client. |
| `Unauthorized` (upload step) | The token is valid but the account isn't authorized for the item: it must **own** the item, the Chrome Web Store API must be **enabled**, and after any Developer-Dashboard change you must **publish manually once** before the API will publish. |

## Store listing assets & copy

The full submission package — paste-ready name/summary/description, category,
per-permission justifications, privacy/data disclosures, screenshot specs — lives
in `docs/store-submissions/CHROME_WEBSTORE.md`. Privacy policy: `PRIVACY.md` (hosted at the repo's
public URL). Screenshots: 1280×800 or 640×400, 24-bit PNG, no alpha (there's a
`assets/v1/screenshot-1280x800.png`). Other Chromium browsers (Brave/Opera/Vivaldi)
use the Chrome zip.

## References

- Submission package (this repo) — `docs/store-submissions/CHROME_WEBSTORE.md`, `PRIVACY.md`, `CHANGELOG.md`
- Release workflow (this repo) — `.github/workflows/release.yml`
- WXT publishing / zip — https://wxt.dev/guide/essentials/publishing
- Chrome Web Store publishing — https://developer.chrome.com/docs/webstore/publish
- Chrome Web Store **API** (endpoints + OAuth) — https://developer.chrome.com/docs/webstore/using-api
- Google OAuth Playground (mint the refresh token) — https://developers.google.com/oauthplayground/
- Edge Add-ons submission — https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension
- Firefox AMO submission — https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- Semantic Versioning — https://semver.org/
