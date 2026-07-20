import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
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
