import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

// Typed manifest source. `@crxjs/vite-plugin` consumes this at build time and
// emits `dist/manifest.json`. The version is pulled from package.json so a
// single release bump keeps them in sync.
export default defineManifest({
  manifest_version: 3,
  name: 'Image Bulk Downloads',
  version: pkg.version,
  description: 'Collect and download all images from a webpage',
  permissions: ['downloads', 'storage', 'tabs'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/extension/background.ts',
    type: 'module',
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      16: 'assets/icon16.png',
      32: 'assets/icon32.png',
      48: 'assets/icon48.png',
      128: 'assets/icon128.png',
    },
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/extension/content.ts'],
    },
  ],
  icons: {
    16: 'assets/icon16.png',
    32: 'assets/icon32.png',
    48: 'assets/icon48.png',
    128: 'assets/icon128.png',
  },
});
