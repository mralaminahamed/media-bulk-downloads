# Chrome Web Store API publishing — the auth reality

How `publish-chrome` in `.github/workflows/release.yml` pushes the zip, and the
credential setup that actually works. We call the API directly with `curl` (no npm
package — `chrome-webstore-upload-cli` broke, see the error table).

## The three calls

1. **OAuth token** — `POST https://oauth2.googleapis.com/token` with
   `client_id` / `client_secret` / `refresh_token` / `grant_type=refresh_token`.
2. **Upload** (v1.1, item-scoped — needs only the item id, no publisher id):
   `PUT https://www.googleapis.com/upload/chromewebstore/v1.1/items/<ITEM_ID>`,
   header `x-goog-api-version: 2`. Success ⇒ `uploadState: "SUCCESS"`.
3. **Publish** —
   `POST https://www.googleapis.com/chromewebstore/v1.1/items/<ITEM_ID>/publish`.

We deliberately use the **v1.1 item endpoint**, not the newer **v2
publisher-scoped** one
(`chromewebstore.googleapis.com/upload/v2/publishers/<PUBLISHER_ID>/items/<ID>:upload`)
that `chrome-webstore-upload` v6 switched to — v2 adds a `publisherId` and a
publisher-authorization failure mode we don't need.

## Secrets (all a MATCHED set from one client)

`CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, plus
`CHROME_EXTENSION_ID`. The three OAuth secrets must all come from the **same**
OAuth client, or the token step fails with `unauthorized_client`.

## Minting the refresh token (step by step)

1. In **Google Cloud Console**, create/select a project and **enable the Chrome
   Web Store API** (APIs & Services → Library).
2. Create an OAuth client of type **"Web application"** (not "Desktop"), and add the
   redirect URI `https://developers.google.com/oauthplayground`.
3. Open the [OAuth Playground](https://developers.google.com/oauthplayground/) →
   gear (⚙, top-right) → **Use your own OAuth credentials** → paste the client id +
   secret.
4. In the left scope box, enter `https://www.googleapis.com/auth/chromewebstore`
   → **Authorize APIs**, and sign in as the account that **owns** the store item.
5. **Exchange authorization code for tokens** → copy the **refresh token** into
   `CHROME_REFRESH_TOKEN`. (Test-mode-consent tokens expire fast — if the project's
   OAuth consent screen is in "Testing", publish it or expect to re-mint.)

## Error → cause

| Error (where) | Cause / fix |
|---|---|
| `Option "publisherId" is required` (cli) | `chrome-webstore-upload-cli@4` → lib v6 uses the v2 publisher-scoped API. We avoid it by calling v1.1 item-scoped with curl. |
| `invalid_grant` (token step) | Refresh token expired or revoked (test-mode-consent tokens expire fast). Regenerate it. |
| `unauthorized_client` (token step) | `CLIENT_ID`/`CLIENT_SECRET` don't match the client that issued the refresh token, **or** the client isn't a "Web application". Regenerate all three as a matched set from one Web-application client. |
| `Unauthorized` (upload step) | Token valid but the account isn't authorized for the item: it must **own** the item, the Chrome Web Store API must be **enabled**, and after any Developer-Dashboard change you must **publish manually once** before the API will publish. |

## Re-running without a new tag

`publish-chrome` supports `workflow_dispatch` — it publishes the current
`package.json` version: `gh workflow run release.yml --ref <branch>`.

## Links

- Using the CWS API (endpoints + OAuth) — https://developer.chrome.com/docs/webstore/using-api
- OAuth Playground — https://developers.google.com/oauthplayground/
- CWS publish overview — https://developer.chrome.com/docs/webstore/publish
