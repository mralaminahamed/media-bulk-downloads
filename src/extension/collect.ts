/**
 * collect.ts
 *
 * Pure, in-page media collection — used by the content script (to answer
 * GET_IMAGES) and by the on-page bubble (which collects directly).
 *
 * Collection is intentionally network-free. Earlier versions issued a HEAD
 * request per image to read Content-Length; that fired hundreds of cross-origin
 * requests on every tab load and leaked browsing signals. Remote file sizes are
 * reported as unknown (0); base64 sizes are computed locally.
 */

import { ImageInfo, MediaItem } from '@/types';
import { detectType, parseUrlDimensions } from '@/extension/shared/imageUrl';
import { detectAvType, isUndownloadableMedia } from '@/extension/shared/mediaType';
import { imageUrlsFromElement, galleryLinkCandidate, noscriptImageCandidates } from '@/extension/shared/extract';
import { resolve, MediaCandidate } from '@/extension/shared/resolvers';
import { twitterGifCandidate, twitterVideoPending } from '@/extension/shared/resolvers/twitter';

/** Determines if a URL is a base64-encoded image. */
export function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/');
}

/** Extracts the image type from a base64 data URI. */
export function getBase64ImageType(src: string): string {
  const match = src.match(/^data:image\/([\w.+-]+)\s*;/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

/** Calculates the size of a base64-encoded image in bytes. */
export function getBase64ImageSize(src: string): number {
  const base64 = src.split(',')[1];
  if (!base64) return 0;
  const padding = base64.match(/=+$/)?.[0].length ?? 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Safely retrieves the intrinsic dimensions of an image element. */
export function getImageDimensions(img: HTMLImageElement): { width: number; height: number } {
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

/**
 * Determines the image type from its URL, ignoring query strings and fragments.
 * Returns a lowercase extension-style type, or 'unknown'.
 */
export function getImageType(src: string): string {
  const path = src.split(/[?#]/)[0];
  const lastSegment = path.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex === -1) return 'unknown';

  const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'jfif':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
    case 'bmp':
    case 'ico':
      return extension;
    default:
      return 'unknown';
  }
}

/**
 * Parses a srcset attribute into an array of URLs. Splits only on commas that
 * separate candidates — commas inside data: URIs or query strings are preserved.
 */
export function parseSrcset(srcset: string): string[] {
  return srcset
    .trim()
    .split(/,(?=\s*(?:https?:|data:|blob:|\/|\.{1,2}\/|[\w-]+[./]))/i)
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * Resolves a possibly-relative URL against the document base so downloads and
 * previews work. Data URIs are returned unchanged.
 */
export function resolveUrl(src: string): string {
  if (isBase64Image(src)) return src;
  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
}

/** Collects information about all media (images, video, audio) on the page. */
export function collectMedia(): MediaItem[] {
  const media: MediaItem[] = [];
  const seenSources = new Set<string>();

  // Maps a resolved candidate to a MediaItem/ImageInfo, preserving the dimension
  // fallback and dedup semantics of the pre-registry implementation.
  const pushCandidate = (
    cand: MediaCandidate, resolved: string, alt: string, width: number, height: number, thumbnailOverride?: string,
  ): void => {
    if (seenSources.has(cand.url)) return;
    seenSources.add(cand.url);

    if (cand.kind === 'video' || cand.kind === 'gif') {
      const item: MediaItem = {
        src: cand.url, alt, width: 0, height: 0,
        type: cand.ext || detectAvType(cand.url), fileSize: 0, isBase64: false, kind: 'video',
      };
      if (cand.poster) item.poster = cand.poster;
      if (cand.resolveHint) item.resolveHint = cand.resolveHint;
      if (cand.unresolvedVideo) item.unresolvedVideo = true;
      media.push(item);
      return;
    }

    // DOM dimensions win; otherwise fall back to whatever the URL encodes.
    // The upgraded candidate URL often has its size hint stripped away (that's
    // the point of the upgrade), so also try the pre-upgrade `resolved` URL,
    // which still carries the thumbnail's size token (e.g. Shopify `_800x600`,
    // Twitter `name=360x360`).
    let w = width;
    let h = height;
    if (w === 0 && h === 0) {
      const dims = parseUrlDimensions(resolved) ?? parseUrlDimensions(cand.url);
      if (dims) {
        w = dims.width;
        h = dims.height;
      }
    }

    const info: ImageInfo = {
      src: cand.url,
      alt,
      width: w,
      height: h,
      type: detectType(cand.url),
      fileSize: 0, // remote size unknown at collection time
      isBase64: false,
      kind: 'image',
    };
    const thumb = thumbnailOverride ? resolveUrl(thumbnailOverride) : cand.thumbnailSrc;
    if (thumb && thumb !== cand.url) info.thumbnailSrc = thumb;
    if (cand.resolveHint) info.resolveHint = cand.resolveHint;
    media.push(info);
  };

  const collectImageInfo = (
    rawSrc: string, alt = '', width = 0, height = 0, thumbnailOverride?: string, el?: Element,
  ): void => {
    if (!rawSrc) return;
    const resolved = resolveUrl(rawSrc);

    if (isBase64Image(resolved)) {
      if (seenSources.has(resolved)) return;
      seenSources.add(resolved);
      media.push({
        src: resolved,
        alt,
        width,
        height,
        type: getBase64ImageType(resolved),
        fileSize: getBase64ImageSize(resolved),
        isBase64: true,
        kind: 'image',
      });
      return;
    }

    for (const cand of resolve(resolved, { el, allowNetwork: false })) {
      pushCandidate(cand, resolved, alt, width, height, thumbnailOverride);
    }
  };

  // <img> tags and their srcset.
  document.querySelectorAll('img').forEach((img) => {
    const { width, height } = getImageDimensions(img);
    const urls = imageUrlsFromElement(img);
    urls.forEach((src, i) =>
      collectImageInfo(src, img.alt, i === 0 ? width : 0, i === 0 ? height : 0, undefined, img));
  });

  // <picture> elements: <img> fallback plus every <source srcset>.
  document.querySelectorAll('picture').forEach((picture) => {
    const img = picture.querySelector('img');
    if (img) {
      const { width, height } = getImageDimensions(img);
      const urls = imageUrlsFromElement(img);
      urls.forEach((src, i) =>
        collectImageInfo(src, img.alt, i === 0 ? width : 0, i === 0 ? height : 0, undefined, img));
    }
    picture.querySelectorAll('source').forEach((source) => {
      imageUrlsFromElement(source).forEach((src) => collectImageInfo(src, '', 0, 0, undefined, source));
    });
  });

  // CSS background-image declarations (handles multiple comma-separated layers).
  document.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const bgImage = window.getComputedStyle(el).getPropertyValue('background-image');
    if (!bgImage || bgImage === 'none') return;
    for (const match of bgImage.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
      // Pass the element so a resolver can read its context (e.g. a Twitter video
      // poster set as a background-image finds the cell's /status/ link).
      if (match[2]) collectImageInfo(match[2], '', 0, 0, undefined, el);
    }
  });

  // <video> and <audio> — direct-file sources only. Streaming manifests and
  // blob: URLs are skipped (chrome.downloads can't fetch them as one file).
  const collectAv = (
    rawSrc: string,
    kind: 'video' | 'audio',
    mime: string | undefined,
    alt: string,
    posterUrl?: string,
  ): void => {
    if (!rawSrc) return;
    const resolved = resolveUrl(rawSrc);
    if (isUndownloadableMedia(resolved)) return;
    if (seenSources.has(resolved)) return;
    seenSources.add(resolved);
    const item: MediaItem = {
      src: resolved, alt, width: 0, height: 0,
      type: detectAvType(resolved, mime),
      fileSize: 0, isBase64: false, kind,
    };
    if (kind === 'video' && posterUrl && !isUndownloadableMedia(posterUrl)) item.poster = posterUrl;
    media.push(item);
  };

  document.querySelectorAll('video').forEach((video) => {
    const gif = twitterGifCandidate(video);
    if (gif && !seenSources.has(gif.url)) {
      seenSources.add(gif.url);
      media.push({
        src: gif.url, alt: '', width: 0, height: 0,
        type: 'mp4', fileSize: 0, isBase64: false, kind: 'video', poster: gif.poster,
      });
    }

    const pendingVid = twitterVideoPending(video);
    if (pendingVid && !seenSources.has(pendingVid.url)) {
      seenSources.add(pendingVid.url);
      media.push({
        src: pendingVid.url, alt: '', width: 0, height: 0, type: 'mp4', fileSize: 0, isBase64: false,
        kind: 'video', poster: pendingVid.poster, resolveHint: pendingVid.resolveHint, unresolvedVideo: true,
      });
    }

    const rawPoster = video.getAttribute('poster');
    const posterUrl = rawPoster ? resolveUrl(rawPoster) : undefined;
    const alt = video.getAttribute('aria-label') || video.getAttribute('title') || '';
    collectAv(
      video.currentSrc || video.getAttribute('src') || video.getAttribute('data-src') || '',
      'video', undefined, alt, posterUrl,
    );
    video.querySelectorAll('source').forEach((s) =>
      collectAv(s.getAttribute('src') || '', 'video', s.getAttribute('type') || undefined, alt, posterUrl),
    );
  });

  document.querySelectorAll('audio').forEach((audio) => {
    const alt = audio.getAttribute('aria-label') || audio.getAttribute('title') || '';
    collectAv(
      audio.currentSrc || audio.getAttribute('src') || audio.getAttribute('data-src') || '',
      'audio', undefined, alt,
    );
    audio.querySelectorAll('source').forEach((s) =>
      collectAv(s.getAttribute('src') || '', 'audio', s.getAttribute('type') || undefined, alt),
    );
  });

  // Gallery / lightbox links: full-res <a href> over a thumbnail <img>.
  document.querySelectorAll('a').forEach((a) => {
    const c = galleryLinkCandidate(a as HTMLAnchorElement);
    if (c) collectImageInfo(c.url, '', 0, 0, c.thumbnailSrc, a.querySelector('img') ?? a);
  });

  // <noscript> fallbacks (real image often lives here for no-JS users).
  document.querySelectorAll('noscript').forEach((ns) => {
    noscriptImageCandidates(ns as HTMLElement).forEach((c) => collectImageInfo(c.url, '', 0, 0, c.thumbnailSrc));
  });

  return media;
}
