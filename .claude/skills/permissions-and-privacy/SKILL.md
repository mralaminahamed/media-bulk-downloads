---
name: permissions-and-privacy
description: Reason about this extension's permissions, host access, and privacy posture — adding/justifying a permission, keeping to least privilege, and the network-free-by-default stance. Use when editing the manifest permissions, adding an API that needs a new permission, writing store justifications, or answering "what data does it collect / is this private".
---

# Permissions & privacy

Declared in `wxt.config.ts` (manifest function). Current set — keep this list and
the store justifications (`docs/CHROME_WEBSTORE.md` §4) in sync:

| Permission | Why |
|---|---|
| `downloads` | Save selected media via `chrome.downloads.download` |
| `downloads.open` | Open a downloaded file from the in-app history (`chrome.downloads.open`) |
| `storage` | Settings (`storage.sync`) + download history (`storage.local`), on-device |
| `tabs` | Read the active tab's URL/title to label downloads and open a source URL |
| host `<all_urls>` | Read media on whatever page the user runs it on; opt-in original-resolution fetches to media CDNs |

## Least privilege — before adding a permission

1. Can an existing permission do it? (e.g. `activeTab` vs `<all_urls>` — but this
   extension genuinely needs all-URLs for the badge + on-any-page collection.)
2. Adding a permission (esp. `downloads.open`) triggers a re-permission prompt on
   update and needs a store justification. Add both.
3. Firefox MV3 also needs `browser_specific_settings.gecko.data_collection_permissions`
   (this extension declares `['none']`).

## Privacy stance (must stay true)

- **Network-free by default:** collection only reads what the page already loaded.
  The one opt-in exception (`resolveOriginals`) fetches higher-res originals
  **directly from the media's own CDN**, host-pinned, only while downloading.
- **No servers, no analytics, no accounts.** Settings/history never leave the
  device (sync settings stay in the user's own Chrome sync).
- **Scheme allowlist:** only `http(s)` (and `data:image`) media is ever surfaced —
  `javascript:`/`data:text`/`file:`/`blob:` are dropped so nothing dangerous
  reaches an `<a href>`/tab-open sink. Page-supplied ids are shape-validated
  before URL interpolation; API-JSON URLs are pinned to https + expected host.
- `PRIVACY.md` is the published policy — update it if data handling ever changes.

## References

- Privacy policy + store disclosures (this repo) — `PRIVACY.md`, `docs/CHROME_WEBSTORE.md`
- Chrome permissions list — https://developer.chrome.com/docs/extensions/reference/permissions-list
- Declare permissions — https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- CWS user-data policy — https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Firefox data collection permissions — https://extensionworkshop.com/documentation/develop/data-collection-permissions/
