import { defineConfig } from 'wxt';

// WXT drives the whole multi-browser build. `wxt build`/`wxt zip` target Chrome
// by default; `-b firefox` / `-b edge` produce the other packages. The manifest
// is a function of the target browser, so Firefox's gecko settings only apply
// there and WXT converts the MV3 background (service_worker → scripts) per browser.
//
// srcDir: 'src' puts entrypoints, public assets, and all code under src/, and
// makes WXT's `@` alias resolve to src/ — matching the codebase's `@/...` imports.
export default defineConfig({
  srcDir: 'src',
  // Static assets (extension icons) live under src/ alongside the rest of the code.
  publicDir: 'src/public',
  // Build Manifest V3 for every target, including Firefox (109+). WXT converts
  // the MV3 background to Firefox's event-page `background.scripts` form.
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  // We use explicit imports and the `chrome.*` namespace throughout (typed via
  // @types/chrome, available on Chrome and Firefox), so WXT's auto-imports are off.
  imports: false,
  // Clean zip filenames (the package name is scoped, which WXT would otherwise
  // mangle): media-bulk-downloads-<version>-<browser>.zip.
  zip: {
    name: 'media-bulk-downloads',
  },
  manifest: ({ browser }) => ({
    name: 'Media Bulk Downloads',
    description:
      'Bulk-download images, video & audio from any web page. Smart type filters, instant preview, original quality — fast and private.',
    // Safari Web Extensions have no `downloads` or `offscreen` API — omit both
    // there (the platform seam falls back to an anchor-blob download and an
    // in-page capture host). `offscreen` is also Chrome-only vs Firefox (AMO
    // rejects it), so Firefox omits it too.
    permissions: [
      ...(browser === 'safari' ? [] : ['downloads', 'downloads.open']),
      'storage',
      'tabs',
      'contextMenus',
      ...(browser === 'firefox' || browser === 'safari' ? [] : ['offscreen']),
    ],
    // Requested at runtime, so neither shows an install-time permission prompt:
    // `notifications` when the user turns on finish notifications, and
    // `declarativeNetRequestWithHostAccess` when they opt into the hotlink-403 Referer
    // retry (#197) from a failed download — granted from the popup's user gesture.
    // NOTE: it MUST be `declarativeNetRequestWithHostAccess`, not `declarativeNetRequest`
    // — Chrome forbids the latter in optional_permissions and silently drops it, so the
    // runtime request would never grant. The WithHostAccess variant gives the same
    // chrome.declarativeNetRequest API; its actions apply only to hosts we can access,
    // which is fine since we hold `<all_urls>` as a required host permission.
    // Safari supports neither notifications nor dynamic DNR header rules, so it
    // gets no optional permissions (the seam reports both unavailable there).
    optional_permissions: browser === 'safari' ? [] : ['notifications', 'declarativeNetRequestWithHostAccess'],
    host_permissions: ['<all_urls>'],
    // Chrome/Edge install floor. The hard requirement is `chrome.offscreen`
    // (createDocument/hasDocument, used for HLS/DASH capture) — stable in Chrome
    // 109. Everything else is at or below it (DNR session rules land in 108), and
    // we use no 116+ API (no chrome.runtime.getContexts). Firefox declares its own
    // floor via browser_specific_settings.gecko.strict_min_version below, so this
    // Chromium-only key is omitted there (web-ext would flag it as unknown).
    ...(browser === 'firefox' || browser === 'safari' ? {} : { minimum_chrome_version: '109' }),
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      64: 'icon/64.png',
      128: 'icon/128.png',
    },
    // Keyboard shortcuts. `_execute_action` is the browser's built-in "open the
    // popup" command; `download-all-media` is dispatched via commands.onCommand.
    // Suggested keys are best-effort — the browser drops any that conflict, and
    // users can rebind them at the extension shortcuts page. `commands` is a
    // manifest key, not a permission, so this adds no permission prompt.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Ctrl+Shift+M', mac: 'Command+Shift+M' },
        description: 'Open Media Bulk Downloads',
      },
      'download-all-media': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: 'Download all media on the current page',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'media-bulk-downloads@mralaminahamed',
              // `data_collection_permissions` is supported from Firefox 140 (Android
              // 142); pin the floors so the key is honored and AMO stops warning that
              // it predates the declared minimum.
              strict_min_version: '140.0',
              // Required by AMO: the extension collects no user data.
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: {
              strict_min_version: '142.0',
            },
          },
        }
      : {}),
  }),
});
