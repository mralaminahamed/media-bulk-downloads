import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  imports: false,
  zip: {
    name: 'media-bulk-downloads',
  },
  manifest: ({ browser }) => ({
    name: 'Media Bulk Downloads',
    description:
      'Bulk-download images, video & audio from any web page. Smart type filters, instant preview, original quality — fast and private.',
    permissions: [
      ...(browser === 'safari' ? [] : ['downloads', 'downloads.open']),
      'storage',
      'tabs',
      'contextMenus',
      ...(browser === 'firefox' || browser === 'safari' ? [] : ['offscreen']),
    ],
    optional_permissions: browser === 'safari' ? [] : ['notifications', 'declarativeNetRequestWithHostAccess'],
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' || browser === 'safari' ? {} : { minimum_chrome_version: '109' }),
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      64: 'icon/64.png',
      128: 'icon/128.png',
    },
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
              strict_min_version: '140.0',
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
