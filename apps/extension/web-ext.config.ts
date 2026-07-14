import { defineWebExtConfig } from 'wxt';

// Configures the browser that `wxt dev` launches (via web-ext). This is a
// dev-only convenience — it has NO effect on the built extension or the store
// zips. Lives at the project root (not srcDir), per WXT's structure.
// Docs: https://wxt.dev/guide/essentials/config/browser-startup
export default defineWebExtConfig({
  // Open a couple of media-heavy, no-login pages on launch so the extension is
  // testable the moment `wxt dev` finishes — a dense image grid plus a page mixing
  // images with inline audio/video, which exercises the media-type filters.
  startUrls: [
    'https://commons.wikimedia.org/wiki/Category:Featured_pictures_on_Wikimedia_Commons',
    'https://en.wikipedia.org/wiki/Cat',
  ],

  // WXT launches a FRESH temporary profile each dev run, so test-site logins don't
  // persist across reloads. To keep them, point at a local profile dir and keep
  // changes — but this path is personal to your machine, so leave it commented and
  // do NOT commit a real path (uncomment locally only):
  // chromiumProfile: '/absolute/path/to/your/dev-profile',
  // keepProfileChanges: true,

  // Auto-open DevTools for debugging the content script / on-page bubble:
  // openDevtools: true,
});
