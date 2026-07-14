import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // The content module registers GET_IMAGES / deep-scan listeners and lazily
    // mounts the on-page bubble. Importing it here runs that side-effect setup.
    import('@/extension/content');
  },
});
