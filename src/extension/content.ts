/**
 * content.ts
 *
 * This script collects information about images on the current webpage,
 * including those in srcset attributes and CSS backgrounds.
 */

import { ImageInfo } from '@/types';

/**
 * Determines if a URL is a base64-encoded image.
 * @param {string} src The URL to check.
 * @returns {boolean} True if the URL is a base64-encoded image, false otherwise.
 */
export function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/');
}

/**
 * Extracts the image type from a base64 data URI.
 * @param {string} src The base64 data URI.
 * @returns {string} The image type.
 */
export function getBase64ImageType(src: string): string {
  const match = src.match(/^data:image\/(\w+);base64,/);
  return match ? match[1] : 'unknown';
}

/**
 * Calculates the size of a base64-encoded image in bytes.
 * @param {string} src The base64 data URI.
 * @returns {number} The size of the image in bytes.
 */
export function getBase64ImageSize(src: string): number {
  const base64 = src.split(',')[1];
  return base64 ? Math.ceil((base64.length * 3) / 4) : 0;
}

/**
 * Safely retrieves the dimensions of an image element.
 * @param {HTMLImageElement} img - The image element.
 * @returns {{ width: number, height: number }} The dimensions of the image.
 */
export function getImageDimensions(img: HTMLImageElement): { width: number, height: number } {
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height
  };
}

/**
 * Determines the image type from its URL.
 * @param {string} src - The source URL of the image.
 * @returns {string} The determined image type.
 */
export function getImageType(src: string): string {
  const extension = src.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return extension;
    default:
      return 'unknown';
  }
}

/**
 * Fetches the file size of an image.
 * @param {string} url - The URL of the image.
 * @returns {Promise<number>} A promise that resolves with the file size in bytes.
 */
export async function getFileSize(url: string): Promise<number> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return parseInt(response.headers.get('Content-Length') || '0');
  } catch (error) {
    return 0;
  }
}

/**
 * Parses a srcset attribute and returns an array of URLs.
 * @param {string} srcset - The srcset attribute value to parse.
 * @returns {string[]} An array of image URLs extracted from the srcset.
 */
export function parseSrcset(srcset: string): string[] {
  return srcset.split(',').map(src => src.trim().split(' ')[0]);
}

/**
 * Collects information about all images on the page.
 * @returns {Promise<ImageInfo[]>} A promise that resolves with an array of image information objects.
 */
export async function collectImages(): Promise<ImageInfo[]> {
  const images: ImageInfo[] = [];
  const seenSources = new Set<string>();

  const collectImageInfo = async (src: string, alt: string = '', width: number = 0, height: number = 0) => {
    if (!seenSources.has(src)) {
      seenSources.add(src);
      const isBase64 = isBase64Image(src);
      const fileSize = isBase64 ? getBase64ImageSize(src) : await getFileSize(src);
      const type = isBase64 ? getBase64ImageType(src) : getImageType(src);

      images.push({
        src,
        alt,
        width,
        height,
        type,
        fileSize,
        isBase64
      });
    }
  };

  // Collect images from <img> tags and their srcset
  const imgPromises = Array.from(document.querySelectorAll('img')).flatMap(img => {
    const { width, height } = getImageDimensions(img);
    const promises = [collectImageInfo(img.src, img.alt, width, height)];
    
    if (img.srcset) {
      promises.push(...parseSrcset(img.srcset).map(src => collectImageInfo(src, img.alt)));
    }
    
    return promises;
  });

  // Collect images from <picture> elements
  const picturePromises = Array.from(document.querySelectorAll('picture')).flatMap(picture => {
    const promises: Promise<void>[] = [];
    const img = picture.querySelector('img');
    
    if (img) {
      const { width, height } = getImageDimensions(img);
      promises.push(collectImageInfo(img.src, img.alt, width, height));
      
      if (img.srcset) {
        promises.push(...parseSrcset(img.srcset).map(src => collectImageInfo(src, img.alt)));
      }
    }
    
    picture.querySelectorAll('source').forEach(source => {
      if (source.srcset) {
        promises.push(...parseSrcset(source.srcset).map(src => collectImageInfo(src)));
      }
    });
    
    return promises;
  });

  // Collect background images
  const bgImagePromises = Array.from(document.querySelectorAll('*')).map(el => {
    const style = window.getComputedStyle(el);
    const bgImage = style.getPropertyValue('background-image');
    if (bgImage !== 'none') {
      const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
      if (match && match[1]) {
        return collectImageInfo(match[1]);
      }
    }
    return Promise.resolve();
  });

  await Promise.all([...imgPromises, ...picturePromises, ...bgImagePromises]);

  return images;
}

// Listen for messages from the extension popup
chrome.runtime.onMessage.addListener(( message: string, sender: chrome.runtime.MessageSender, sendResponse: ( response: ImageInfo[] ) => void ) => {
  if (message === 'GET_IMAGES') {
    collectImages().then(sendResponse);
    return true; // Keeps the message channel open for asynchronous response
  }
});