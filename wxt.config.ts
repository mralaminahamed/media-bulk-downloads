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
    permissions: ['downloads', 'downloads.open', 'storage', 'tabs', 'contextMenus'],
    // Requested at runtime only when the user turns on "notify when downloads
    // finish" — so it never shows an install-time permission prompt.
    optional_permissions: ['notifications'],
    host_permissions: ['<all_urls>'],
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
              strict_min_version: '109.0',
              // Required by AMO: the extension collects no user data.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
