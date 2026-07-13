import { ImageInfo } from '@mbd/core/types';
import { upgradeToOriginal, detectType } from '@mbd/core/collection/imageUrl';
import { extensionFromUrl } from '@mbd/core/collection/mediaType';

// ── Right-click context menu ─────────────────────────────────────────────────
export const MENU = {
  downloadAll: 'mbd-download-all',
  downloadImage: 'mbd-download-image',
  favouriteImage: 'mbd-favourite-image',
  downloadMedia: 'mbd-download-media',
} as const;

/**
 * (Re)create the context menu items. removeAll-then-create is idempotent, so
 * this is safe to run on both install and startup without duplicate-id errors.
 */
export function setupContextMenus(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create({ id: MENU.downloadAll, title: 'Download all media on this page', contexts: ['all'] });
    chrome.contextMenus.create({ id: MENU.downloadImage, title: 'Download image (original quality)', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.favouriteImage, title: 'Add image to Favourites', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.downloadMedia, title: 'Download this media', contexts: ['video', 'audio'] });
    void chrome.runtime.lastError; // ignore a benign duplicate-id if menus already exist
  });
}

/**
 * Build an ImageInfo for a right-clicked media element. Images are upgraded to
 * their original via the CDN rules; video/audio are taken as-is. Only real
 * http(s) media is downloadable here — data:/blob: srcs are skipped.
 */
export function mediaFromContext(info: chrome.contextMenus.OnClickData): ImageInfo | null {
  const url = info.srcUrl;
  if (!url || !/^https?:/i.test(url)) return null;
  const kind: ImageInfo['kind'] = info.mediaType === 'video' ? 'video' : info.mediaType === 'audio' ? 'audio' : 'image';
  if (kind === 'image') {
    const { original } = upgradeToOriginal(url);
    return { src: original, alt: '', width: 0, height: 0, type: detectType(original), fileSize: 0, isBase64: false, kind };
  }
  return { src: url, alt: '', width: 0, height: 0, type: extensionFromUrl(url) ?? '', fileSize: 0, isBase64: false, kind };
}
