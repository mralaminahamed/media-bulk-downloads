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

import { ImageInfo, MediaItem } from '@mbd/core/types';
import { detectType, parseUrlDimensions } from '@mbd/core/collection/imageUrl';
import { classifyPage, collectPageSignals } from '@mbd/core/collection/pageType';
import { detectAvType, isUndownloadableMedia, isHlsManifest, isDashManifest } from '@mbd/core/collection/mediaType';
import { imageUrlsFromElement, galleryLinkCandidate, noscriptImageCandidates, bestSrcsetUrl } from '@mbd/core/collection/extract';
import { canonicalSrcKey } from '@mbd/core/collection/canonical';
import { resolve, MediaCandidate } from '@mbd/core/resolvers';
import { twitterGifCandidate, twitterVideoPending } from '@mbd/core/resolvers/sites/twitter';
import { instagramPageMedia } from '@mbd/core/resolvers/sites/instagram';
import { facebookPageMedia } from '@mbd/core/resolvers/sites/facebook';
import { pinterestPageMedia } from '@mbd/core/resolvers/sites/pinterest';
import { shopifyPageMedia } from '@mbd/core/resolvers/sites/shopify';
import { youtubeVideoId } from '@mbd/core/resolvers/sites/youtube';
import { vimeoVideoId } from '@mbd/core/resolvers/sites/vimeo';
import { dailymotionVideoId } from '@mbd/core/resolvers/sites/dailymotion';
import { rutubeVideoId } from '@mbd/core/resolvers/sites/rutube';
import { rumbleWatchUrl } from '@mbd/core/resolvers/sites/rumble';
import { peertubeEmbedUrl } from '@mbd/core/resolvers/sites/peertube';
import { loomVideoId } from '@mbd/core/resolvers/sites/loom';
import { coubMediaFromJson } from '@mbd/core/resolvers/sites/coub';
import { fanboxPageMedia } from '@mbd/core/resolvers/sites/fanbox';
import { tiktokPageMedia } from '@mbd/core/resolvers/sites/tiktok';
import { patreonPageMedia } from '@mbd/core/resolvers/sites/patreon';
import { eromePageMedia } from '@mbd/core/resolvers/sites/erome';
import { imgchestPageMedia } from '@mbd/core/resolvers/sites/imagechest';
import { kemonoPageMedia } from '@mbd/core/resolvers/sites/kemono';
import { fapelloPageMedia } from '@mbd/core/resolvers/sites/fapello';
import { cheveretoPageMedia, CHEVERETO_HOST_RE } from '@mbd/core/resolvers/sites/chevereto';
import { imgurPageMedia } from '@mbd/core/resolvers/sites/imgur';
import { tenorPageMedia } from '@mbd/core/resolvers/sites/tenor';
import { pexelsPageMedia } from '@mbd/core/resolvers/sites/pexels';
import { xvideosPageMedia } from '@mbd/core/resolvers/sites/xvideos';
import { xhamsterPageMedia } from '@mbd/core/resolvers/sites/xhamster';
import { pornhubPageMedia } from '@mbd/core/resolvers/sites/pornhub';
import { lensdumpPageMedia } from '@mbd/core/resolvers/sites/lensdump';
import { motherlessPageMedia } from '@mbd/core/resolvers/sites/motherless';
import { imagehostsPageMedia, isImageHost } from '@mbd/core/resolvers/sites/imagehosts';
import { imgpilePageMedia } from '@mbd/core/resolvers/sites/imgpile';
import { szurubooruPageMedia } from '@mbd/core/resolvers/sites/szurubooru';
import { soundcloudTrackUrl } from '@mbd/core/resolvers/sites/soundcloud';
import { streamableVideoId } from '@mbd/core/resolvers/sites/streamable';
import { redgifsVideoId } from '@mbd/core/resolvers/sites/redgifs';
import { twitchClipId, twitchVodId } from '@mbd/core/resolvers/sites/twitch';
import { nineGagId } from '@mbd/core/resolvers/sites/ninegag';
import { sniffedHlsManifests } from '@mbd/core/resolvers/sniffers/hls-sniff';
import { HOST_ID } from '@/extension/bubble/mount';

/** Determines if a URL is a base64-encoded image. */
export function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/');
}

/** Extracts the image type from a base64 data URI. */
export function getBase64ImageType(src: string): string {
  const match = src.match(/^data:image\/([\w.+-]+)\s*[;,]/i);
  if (!match) return 'unknown';
  const type = match[1].toLowerCase();
  return type === 'svg+xml' ? 'svg' : type;
}

/** Calculates the size of a base64-encoded image in bytes. */
export function getBase64ImageSize(src: string): number {
  const comma = src.indexOf(',');
  if (comma === -1 || !/;base64\s*$/i.test(src.slice(0, comma))) return 0;
  const base64 = src.slice(comma + 1);
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

export { getImageType, parseSrcset } from '@mbd/core/collection/imageUrl';

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

/**
 * Highest-resolution candidate inside one image-set()/-webkit-image-set() group.
 * Candidates are `url("x") 2x` or bare `"x" 2x`; the resolution suffix (x/dppx)
 * defaults to 1 when absent. Returns null when the group holds no usable URL.
 */
function bestImageSetCandidate(inner: string): string | null {
  let best: { url: string; res: number } | null = null;
  const candRe = /(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)(?:\s*([\d.]+)\s*(?:x|dppx))?/gi;
  let c: RegExpExecArray | null;
  while ((c = candRe.exec(inner)) !== null) {
    const url = c[2] || c[4];
    if (!url) continue;
    const res = parseFloat(c[5] || '1') || 1;
    if (!best || res >= best.res) best = { url, res };
  }
  return best?.url ?? null;
}

/**
 * URLs to collect from a computed `background-image` value. Plain `url()` layers
 * are returned as-is; for an `image-set()` / `-webkit-image-set()` layer only the
 * highest-resolution candidate is returned (avoids surfacing every DPR variant of
 * the same image). Handles a value that mixes image-set and plain url() layers.
 */
export function backgroundImageUrls(bgImage: string): string[] {
  const urls: string[] = [];
  const setRe = /(?:-webkit-)?image-set\(/gi;
  const plain: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = setRe.exec(bgImage)) !== null) {
    plain.push(bgImage.slice(lastIndex, m.index));
    let depth = 1;
    let i = setRe.lastIndex;
    for (; i < bgImage.length && depth > 0; i++) {
      if (bgImage[i] === '(') depth++;
      else if (bgImage[i] === ')') depth--;
    }
    const best = bestImageSetCandidate(bgImage.slice(setRe.lastIndex, i - 1));
    if (best) urls.push(best);
    lastIndex = i;
    setRe.lastIndex = i;
  }
  plain.push(bgImage.slice(lastIndex));
  for (const seg of plain) {
    for (const um of seg.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
      if (um[2]) urls.push(um[2]);
    }
  }
  return urls;
}

/** A root the DOM walk can scan: the whole document, an open shadow root, or —
 *  for incremental deep-scan rounds — a single mutated element subtree. */
export type ScanRoot = Document | ShadowRoot | Element;

/** Collects information about all media (images, video, audio) on the page. */
/** Max same-origin gallery/"view" pages to queue for link-following per scan
 *  (#287) — bounds the opt-in network fetches to a sane count on a large index. */
const GALLERY_PAGE_CAP = 60;

/** Below this (px, larger dimension) a wrapped `<img>` is an avatar/icon/glyph,
 *  not a gallery thumbnail — used to keep byline/nav links out of the follow list. */
const GALLERY_MIN_THUMB = 64;

/** A gallery/lightbox link can point straight at a video/audio FILE (not just an
 *  image) — e.g. `<a href="clip.mp4"><img …></a>`. These classify it by extension
 *  so it's collected as a/v (correct kind + real extension) instead of being run
 *  through the image path and saved as a bogus `.jpg`. */
const GALLERY_VIDEO_EXT = /\.(?:mp4|m4v|webm|ogv|mov)(?:$|[?#])/i;
const GALLERY_AUDIO_EXT = /\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus)(?:$|[?#])/i;

/** First path segment of routes that are navigation/taxonomy/account, not a media
 *  detail page. A same-origin `<a>` wrapping an `<img>` that points at one of these
 *  (author bylines, tag/category pills, pagination, search, login…) must NOT be
 *  followed as a gallery "view" page. Cuts the bulk of #287 false positives; can't
 *  perfectly exclude a "related article" card whose href looks like a real permalink. */
const NON_CONTENT_PATH =
  /^\/(?:authors?|tags?|categor(?:y|ies)|topics?|users?|profiles?|members?|about|contact|search|explore|login|sign[-_]?in|sign[-_]?up|register|account|settings|feeds?|rss|pages?|cart|checkout|privacy|terms|help|faq|share|subscribe|newsletter)(?:\/|$)/i;

/** The `<img>`'s largest KNOWN dimension (intrinsic if loaded, else the width/height
 *  attributes), or 0 when the size can't be determined (lazy image, no attributes). */
function knownThumbSize(img: HTMLImageElement | null): number {
  if (!img) return 0;
  const intrinsic = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
  if (intrinsic) return intrinsic;
  return Math.max(Number(img.getAttribute('width')) || 0, Number(img.getAttribute('height')) || 0);
}

export function collectMedia(scanRoots?: ScanRoot[], opts?: { smartPageDefaults?: boolean; resolveOriginals?: boolean }): MediaItem[] {
  const incremental = scanRoots !== undefined;
  const media: MediaItem[] = [];
  const seenKeys = new Set<string>();
  const seenSources = {
    addIfNew: (url: string): boolean => {
      const k = canonicalSrcKey(url);
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    },
  };
  const pageUrl = location.href;

  const pushCandidate = (
    cand: MediaCandidate, resolved: string, alt: string, width: number, height: number, thumbnailOverride?: string,
  ): void => {
    if (!seenSources.addIfNew(cand.url)) return;

    if (cand.kind === 'video' || cand.kind === 'gif') {
      const isHls = cand.ext === 'm3u8' || isHlsManifest(cand.url);
      const isDash = cand.ext === 'mpd' || isDashManifest(cand.url);
      const item: MediaItem = {
        src: cand.url, alt, width: 0, height: 0,
        type: isDash ? 'mpd' : isHls ? 'm3u8' : (cand.ext || detectAvType(cand.url)),
        fileSize: 0, isBase64: false, kind: 'video',
      };
      if (isHls || isDash) item.hlsManifest = cand.url;
      if (cand.poster) item.poster = cand.poster;
      if (cand.resolveHint) item.resolveHint = cand.resolveHint;
      if (cand.unresolvedVideo) item.unresolvedVideo = true;
      if (cand.mediaKey) item.mediaKey = cand.mediaKey;
      media.push(item);
      return;
    }

    let w = cand.width ?? width;
    let h = cand.height ?? height;
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
    if (cand.ext) info.ext = cand.ext;
    if (cand.mediaKey) info.mediaKey = cand.mediaKey;
    media.push(info);
  };

  const collectImageInfo = (
    rawSrc: string, alt = '', width = 0, height = 0, thumbnailOverride?: string, el?: Element,
  ): void => {
    if (!rawSrc) return;
    const resolved = resolveUrl(rawSrc);

    if (isBase64Image(resolved)) {
      if (!seenSources.addIfNew(resolved)) return;
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

    for (const cand of resolve(resolved, { el, allowNetwork: false, pageUrl })) {
      pushCandidate(cand, resolved, alt, width, height, thumbnailOverride);
    }
  };

  const hasLayout =
    (document.documentElement?.offsetHeight ?? 0) > 0 || (document.body?.offsetHeight ?? 0) > 0;

  const pushHls = (resolved: string, alt: string, posterUrl?: string): void => {
    if (!seenSources.addIfNew(resolved)) return;
    const item: MediaItem = {
      src: resolved, alt, width: 0, height: 0,
      type: 'm3u8', fileSize: 0, isBase64: false, kind: 'video',
      hlsManifest: resolved,
    };
    if (posterUrl && /^(https?:|data:image\/)/i.test(posterUrl)) item.poster = posterUrl;
    media.push(item);
  };

  /** A DASH manifest (.mpd) surfaced as a capturable video — same as pushHls but
   *  tagged `type:'mpd'` so the capture path routes it to the DASH engine. */
  const pushDash = (resolved: string, alt: string, posterUrl?: string): void => {
    if (!seenSources.addIfNew(resolved)) return;
    const item: MediaItem = {
      src: resolved, alt, width: 0, height: 0,
      type: 'mpd', fileSize: 0, isBase64: false, kind: 'video',
      hlsManifest: resolved,
    };
    if (posterUrl && /^(https?:|data:image\/)/i.test(posterUrl)) item.poster = posterUrl;
    media.push(item);
  };

  const pushVimeo = (id: string): void => {
    const watch = `https://vimeo.com/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'vimeo', id },
    });
  };

  const pushDailymotion = (id: string): void => {
    const watch = `https://www.dailymotion.com/video/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'dailymotion', id },
    });
  };

  const pushRutube = (id: string): void => {
    const watch = `https://rutube.ru/video/${id}/`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'rutube', id },
    });
  };

  const pushRumble = (url: string): void => {
    if (!seenSources.addIfNew(url)) return;
    media.push({
      src: url, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'rumble', id: url },
    });
  };

  const pushLoom = (id: string): void => {
    const share = `https://www.loom.com/share/${id}`;
    if (!seenSources.addIfNew(share)) return;
    media.push({
      src: share, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'loom', id },
    });
  };

  const pushPeerTube = (embedUrl: string): void => {
    if (!seenSources.addIfNew(embedUrl)) return;
    media.push({
      src: embedUrl, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'peertube', id: embedUrl },
    });
  };

  const pushStreamable = (id: string): void => {
    const watch = `https://streamable.com/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'streamable', id },
    });
  };

  const pushRedgifs = (id: string): void => {
    const watch = `https://www.redgifs.com/watch/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'redgifs', id },
    });
  };

  const pushTwitch = (id: string): void => {
    const watch = `https://clips.twitch.tv/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'twitch', id },
    });
  };

  const pushTwitchVod = (id: string): void => {
    const watch = `https://www.twitch.tv/videos/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'm3u8',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'twitch', id: `vod ${id}` },
    });
  };

  const pushSoundcloud = (trackUrl: string): void => {
    if (!seenSources.addIfNew(trackUrl)) return;
    media.push({
      src: trackUrl, alt: '', width: 0, height: 0, type: 'm3u8',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'soundcloud', id: trackUrl },
    });
  };

  const pushNineGag = (id: string): void => {
    const watch = `https://9gag.com/gag/${id}`;
    if (!seenSources.addIfNew(watch)) return;
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: '9gag', id },
    });
  };

  const nineGagPostHasVideo = (a: Element): boolean =>
    !!a.closest('article, [id^="jsid-post-"]')?.querySelector('video');

  const twitterPendingSeen = new Set<string>();
  const isTwitterPage = (() => {
    try {
      return /(?:^|\.)(?:x|twitter)\.com$/i.test(new URL(pageUrl).hostname);
    } catch {
      return false;
    }
  })();
  const TWITTER_STATUS_CELL = /^\/[^/]+\/status\/(\d{1,20})\/(photo|video)\/(\d{1,3})$/;
  const TWITTER_PAINTED_MEDIA = /pbs\.twimg\.com\/(?:media|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//;
  const pushTwitterPending = (a: HTMLAnchorElement, resolvedHref: string): void => {
    let pathname: string;
    try {
      pathname = new URL(resolvedHref).pathname;
    } catch {
      return;
    }
    const m = pathname.match(TWITTER_STATUS_CELL);
    if (!m) return;
    const [, sid, kind, nStr] = m;
    const dedupKey = `${sid}/${kind}/${nStr}`;
    if (twitterPendingSeen.has(dedupKey)) return;
    twitterPendingSeen.add(dedupKey);

    const painted =
      [...a.querySelectorAll('img[src]')].some((img) => TWITTER_PAINTED_MEDIA.test(img.getAttribute('src') || '')) ||
      [...a.querySelectorAll('video[poster]')].some((v) => TWITTER_PAINTED_MEDIA.test(v.getAttribute('poster') || ''));
    if (painted) return;

    if (!seenSources.addIfNew(resolvedHref)) return;
    if (kind === 'photo') {
      media.push({
        src: resolvedHref, alt: '', width: 0, height: 0, type: 'unknown', fileSize: 0, isBase64: false,
        kind: 'image', unresolvedImage: true,
        resolveHint: { platform: 'twitter', id: `photo ${sid} ${Number(nStr)}` },
      });
    } else {
      media.push({
        src: resolvedHref, alt: '', width: 0, height: 0, type: 'mp4', fileSize: 0, isBase64: false,
        kind: 'video', unresolvedVideo: true,
        resolveHint: { platform: 'twitter', id: sid },
      });
    }
  };

  let galleryPageCount = 0;
  const pushGalleryPage = (a: HTMLAnchorElement, resolvedHref: string): void => {
    if (galleryPageCount >= GALLERY_PAGE_CAP) return;
    let u: URL;
    try {
      u = new URL(resolvedHref);
    } catch {
      return;
    }
    if (u.origin !== location.origin) return;
    if (NON_CONTENT_PATH.test(u.pathname)) return;
    const img = a.querySelector('img');
    const thumbRaw = img ? (img as HTMLImageElement).currentSrc || img.getAttribute('src') : null;
    if (!thumbRaw) return;
    const size = knownThumbSize(img as HTMLImageElement | null);
    if (size && size < GALLERY_MIN_THUMB) return;
    if (!seenSources.addIfNew(resolvedHref)) return;
    galleryPageCount++;
    const thumb = resolveUrl(thumbRaw) || thumbRaw;
    media.push({
      src: resolvedHref, alt: img?.getAttribute('alt') || '', width: 0, height: 0,
      type: 'unknown', fileSize: 0, isBase64: false, kind: 'image',
      thumbnailSrc: thumb, unresolvedImage: true,
      mediaKey: canonicalSrcKey(thumb),
      resolveHint: { platform: 'gallery-page', id: resolvedHref },
    });
  };

  const collectAv = (
    rawSrc: string,
    kind: 'video' | 'audio',
    mime: string | undefined,
    alt: string,
    posterUrl?: string,
  ): void => {
    if (!rawSrc) return;
    const resolved = resolveUrl(rawSrc);
    if (isHlsManifest(resolved) && /^https?:\/\//i.test(resolved)) {
      pushHls(resolved, alt, posterUrl);
      return;
    }
    if (isDashManifest(resolved) && /^https?:\/\//i.test(resolved)) {
      pushDash(resolved, alt, posterUrl);
      return;
    }
    if (isUndownloadableMedia(resolved)) return;
    if (!/^https?:\/\//i.test(resolved)) return;
    if (!seenSources.addIfNew(resolved)) return;
    const item: MediaItem = {
      src: resolved, alt, width: 0, height: 0,
      type: detectAvType(resolved, mime),
      fileSize: 0, isBase64: false, kind,
    };
    if (kind === 'video' && posterUrl && /^(https?:|data:image\/)/i.test(posterUrl)) item.poster = posterUrl;
    media.push(item);
  };

  const roots: ScanRoot[] = scanRoots ?? [document];
  const seenRoots = new Set<ScanRoot>(roots);
  const addRoot = (r: Document | ShadowRoot | null | undefined): void => {
    if (r && !seenRoots.has(r)) {
      seenRoots.add(r);
      roots.push(r);
    }
  };

  const scanRoot = (root: ScanRoot): void => {
    const isElement = root.nodeType === 1;
    const ownerDoc = root.nodeType === 9
      ? (root as Document)
      : (root as ShadowRoot | Element).ownerDocument;
    const view = ownerDoc.defaultView ?? window;

    const imgs: HTMLImageElement[] = [];
    const pictures: Element[] = [];
    const videos: HTMLVideoElement[] = [];
    const audios: HTMLAudioElement[] = [];
    const anchors: HTMLAnchorElement[] = [];
    const noscripts: HTMLElement[] = [];
    const iframes: HTMLIFrameElement[] = [];
    const backgrounds: [Element, string][] = [];

    const els: HTMLElement[] = isElement
      ? [root as HTMLElement, ...Array.from((root as Element).querySelectorAll<HTMLElement>('*'))]
      : Array.from(root.querySelectorAll<HTMLElement>('*'));
    els.forEach((el) => {
      const shadow = el.id !== HOST_ID ? el.shadowRoot : null;
      if (shadow) addRoot(shadow);

      switch (el.tagName) {
        case 'IMG': imgs.push(el as HTMLImageElement); break;
        case 'PICTURE': pictures.push(el); break;
        case 'VIDEO': videos.push(el as HTMLVideoElement); break;
        case 'AUDIO': audios.push(el as HTMLAudioElement); break;
        case 'A': anchors.push(el as HTMLAnchorElement); break;
        case 'NOSCRIPT': noscripts.push(el); break;
        case 'IFRAME': iframes.push(el as HTMLIFrameElement); break;
      }

      if (hasLayout && el.offsetWidth === 0 && el.offsetHeight === 0) return;
      const bgImage = view.getComputedStyle(el).getPropertyValue('background-image');
      if (bgImage && bgImage !== 'none') backgrounds.push([el, bgImage]);
    });

    imgs.forEach((img) => {
      const { width, height } = getImageDimensions(img);
      const loaded = img.currentSrc || img.src;
      imageUrlsFromElement(img).forEach((src) => {
        const isLoaded = resolveUrl(src) === loaded;
        collectImageInfo(src, img.alt, isLoaded ? width : 0, isLoaded ? height : 0, undefined, img);
      });
    });

    pictures.forEach((picture) => {
      picture.querySelectorAll('source').forEach((source) => {
        imageUrlsFromElement(source).forEach((src) => collectImageInfo(src, '', 0, 0, undefined, source));
      });
    });

    backgrounds.forEach(([el, bgImage]) => {
      for (const url of backgroundImageUrls(bgImage)) {
        collectImageInfo(url, '', 0, 0, undefined, el);
      }
    });

    videos.forEach((video) => {
      const gif = twitterGifCandidate(video);
      if (gif && seenSources.addIfNew(gif.url)) {
        media.push({
          src: gif.url, alt: '', width: 0, height: 0,
          type: 'mp4', fileSize: 0, isBase64: false, kind: 'video', poster: gif.poster,
        });
      }

      const pendingVid = twitterVideoPending(video, pageUrl);
      if (pendingVid && seenSources.addIfNew(pendingVid.url)) {
        media.push({
          src: pendingVid.url, alt: '', width: 0, height: 0, type: 'mp4', fileSize: 0, isBase64: false,
          kind: 'video', poster: pendingVid.poster, resolveHint: pendingVid.resolveHint, unresolvedVideo: true,
        });
      }

      const rawPoster = video.getAttribute('poster');
      const posterUrl = rawPoster ? resolveUrl(rawPoster) : undefined;
      const alt = video.getAttribute('aria-label') || video.getAttribute('title') || '';
      [video.currentSrc, video.getAttribute('src'), video.getAttribute('data-src')].forEach((s) =>
        collectAv(s || '', 'video', undefined, alt, posterUrl),
      );
      video.querySelectorAll('source').forEach((s) =>
        collectAv(s.getAttribute('src') || '', 'video', s.getAttribute('type') || undefined, alt, posterUrl),
      );
    });

    audios.forEach((audio) => {
      const alt = audio.getAttribute('aria-label') || audio.getAttribute('title') || '';
      [audio.currentSrc, audio.getAttribute('src'), audio.getAttribute('data-src')].forEach((s) =>
        collectAv(s || '', 'audio', undefined, alt),
      );
      audio.querySelectorAll('source').forEach((s) =>
        collectAv(s.getAttribute('src') || '', 'audio', s.getAttribute('type') || undefined, alt),
      );
    });

    anchors.forEach((a) => {
      const c = galleryLinkCandidate(a);
      if (c) {
        if (GALLERY_VIDEO_EXT.test(c.url)) collectAv(c.url, 'video', undefined, '', c.thumbnailSrc);
        else if (GALLERY_AUDIO_EXT.test(c.url)) collectAv(c.url, 'audio', undefined, '', c.thumbnailSrc);
        else collectImageInfo(c.url, '', 0, 0, c.thumbnailSrc, a.querySelector('img') ?? a);
      }
      const href = a.getAttribute('href');
      const resolvedHref = href ? resolveUrl(href) : '';
      if (resolvedHref && youtubeVideoId(resolvedHref)) collectImageInfo(href!, '', 0, 0, undefined, a);
      // A direct link to an HLS manifest — surface it as a capturable stream.
      else if (resolvedHref && isHlsManifest(resolvedHref) && /^https?:\/\//i.test(resolvedHref)) pushHls(resolvedHref, '');
      // A direct link to a DASH manifest — surface it as a capturable stream.
      else if (resolvedHref && isDashManifest(resolvedHref) && /^https?:\/\//i.test(resolvedHref)) pushDash(resolvedHref, '');
      // A link to a Vimeo video — surface as a pending video resolved on demand.
      else if (resolvedHref && vimeoVideoId(resolvedHref)) pushVimeo(vimeoVideoId(resolvedHref)!);
      // A link to a Dailymotion video — surface as a pending video resolved on demand.
      else if (resolvedHref && dailymotionVideoId(resolvedHref)) pushDailymotion(dailymotionVideoId(resolvedHref)!);
      // A link to a Rutube video — surface as a pending video resolved on demand.
      else if (resolvedHref && rutubeVideoId(resolvedHref)) pushRutube(rutubeVideoId(resolvedHref)!);
      // A link to a Rumble video — surface as a pending video resolved on demand.
      else if (resolvedHref && rumbleWatchUrl(resolvedHref)) pushRumble(rumbleWatchUrl(resolvedHref)!);

      else if (resolvedHref && peertubeEmbedUrl(resolvedHref)) pushPeerTube(peertubeEmbedUrl(resolvedHref)!);

      else if (resolvedHref && loomVideoId(resolvedHref)) pushLoom(loomVideoId(resolvedHref)!);
      // A link to a Streamable video — surface as a pending video resolved on demand.
      else if (resolvedHref && streamableVideoId(resolvedHref)) pushStreamable(streamableVideoId(resolvedHref)!);
      // A link to a RedGifs video — surface as a pending video resolved on demand.
      else if (resolvedHref && redgifsVideoId(resolvedHref)) pushRedgifs(redgifsVideoId(resolvedHref)!);
      // A link to a Twitch clip — surface as a pending video resolved on demand.
      else if (resolvedHref && twitchClipId(resolvedHref)) pushTwitch(twitchClipId(resolvedHref)!);
      // A link to a Twitch VOD (`/videos/<id>`) — surface as a pending video (HLS).
      else if (resolvedHref && twitchVodId(resolvedHref)) pushTwitchVod(twitchVodId(resolvedHref)!);
      // A link to a SoundCloud track — surface as a pending audio item resolved on demand.
      else if (resolvedHref && soundcloudTrackUrl(resolvedHref)) pushSoundcloud(soundcloudTrackUrl(resolvedHref)!);
      // A link to a 9GAG post that carries a <video> (a video/GIF post) — surface
      // as a pending video resolved on demand. Image posts (no <video>) are skipped.
      else if (resolvedHref && nineGagId(resolvedHref) && nineGagPostHasVideo(a)) pushNineGag(nineGagId(resolvedHref)!);
      // An X/Twitter status permalink (`/user/status/<id>/photo|video/<n>`) whose
      // cell never painted its media — surface a pending item resolved on demand.
      else if (isTwitterPage && resolvedHref) pushTwitterPending(a, resolvedHref);
      // A same-origin host/"view" page wrapping a thumbnail (#287) — surface a
      // pending item the opt-in resolve pass follows to the original. `!c` skips
      // links galleryLinkCandidate already collected as direct media.
      else if (opts?.resolveOriginals && !c && resolvedHref) pushGalleryPage(a, resolvedHref);
    });

    noscripts.forEach((ns) => {
      noscriptImageCandidates(ns).forEach((c) => collectImageInfo(c.url, '', 0, 0, c.thumbnailSrc));
    });

    iframes.forEach((frame) => {
      const embedSrc = frame.getAttribute('src') || frame.getAttribute('data-src') || '';
      const resolvedEmbed = embedSrc ? resolveUrl(embedSrc) : '';
      if (resolvedEmbed && youtubeVideoId(resolvedEmbed)) collectImageInfo(embedSrc, '', 0, 0, undefined, frame);
      // A Vimeo player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && vimeoVideoId(resolvedEmbed)) pushVimeo(vimeoVideoId(resolvedEmbed)!);
      // A Dailymotion player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && dailymotionVideoId(resolvedEmbed)) pushDailymotion(dailymotionVideoId(resolvedEmbed)!);
      // A Rutube player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && rutubeVideoId(resolvedEmbed)) pushRutube(rutubeVideoId(resolvedEmbed)!);
      // A Rumble player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && rumbleWatchUrl(resolvedEmbed)) pushRumble(rumbleWatchUrl(resolvedEmbed)!);

      else if (resolvedEmbed && peertubeEmbedUrl(resolvedEmbed)) pushPeerTube(peertubeEmbedUrl(resolvedEmbed)!);

      else if (resolvedEmbed && loomVideoId(resolvedEmbed)) pushLoom(loomVideoId(resolvedEmbed)!);
      // A Streamable player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && streamableVideoId(resolvedEmbed)) pushStreamable(streamableVideoId(resolvedEmbed)!);
      // A RedGifs player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && redgifsVideoId(resolvedEmbed)) pushRedgifs(redgifsVideoId(resolvedEmbed)!);
      // A Twitch clip player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && twitchClipId(resolvedEmbed)) pushTwitch(twitchClipId(resolvedEmbed)!);
      // A Twitch VOD player <iframe> (player.twitch.tv?video=…) — pending video (HLS).
      else if (resolvedEmbed && twitchVodId(resolvedEmbed)) pushTwitchVod(twitchVodId(resolvedEmbed)!);

      let doc: Document | null;
      try {
        doc = frame.contentDocument;
      } catch {
        doc = null;
      }
      addRoot(doc);
    });
  };

  const pageType = !incremental && opts?.smartPageDefaults
    ? classifyPage(collectPageSignals(document))
    : 'unknown';
  const heroFirst = pageType === 'single-media' || pageType === 'article';

  const collectHeroMeta = (): void => {
    const metaSel = [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ].join(',');
    document.querySelectorAll(metaSel).forEach((m) => {
      const content = m.getAttribute('content');
      if (content) collectImageInfo(content);
    });
  };

  const collectPreloadImages = (): void => {
    document.querySelectorAll('link[rel~="preload"][as="image"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href) collectImageInfo(href);
      const imagesrcset = link.getAttribute('imagesrcset');
      if (imagesrcset) {
        const best = bestSrcsetUrl(imagesrcset);
        if (best) collectImageInfo(best);
      }
    });
  };

  if (heroFirst) {
    collectHeroMeta();
    collectPreloadImages();
  }

  for (let i = 0; i < roots.length; i++) scanRoot(roots[i]);

  if (!incremental) {
    if (!heroFirst) collectHeroMeta();

    const ogVideoType = document.querySelector('meta[property="og:video:type"]')?.getAttribute('content') || undefined;
    const ogPoster = document
      .querySelector('meta[property="og:image"], meta[property="og:image:secure_url"]')
      ?.getAttribute('content');
    const ogPosterUrl = ogPoster ? resolveUrl(ogPoster) : undefined;
    document
      .querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]')
      .forEach((m) => {
        const content = m.getAttribute('content');
        if (content) collectAv(content, 'video', ogVideoType, '', ogPosterUrl);
      });

    if (!heroFirst) collectPreloadImages();

    for (const cand of instagramPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }

    for (const cand of facebookPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }

    for (const cand of pinterestPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }

    for (const cand of shopifyPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }

    const rutubePageId = rutubeVideoId(pageUrl);
    if (rutubePageId) pushRutube(rutubePageId);
    const rumblePageUrl = rumbleWatchUrl(pageUrl);
    if (rumblePageUrl) pushRumble(rumblePageUrl);
    const peertubePageUrl = peertubeEmbedUrl(pageUrl);
    if (peertubePageUrl) pushPeerTube(peertubePageUrl);
    const loomPageId = loomVideoId(pageUrl);
    if (loomPageId) pushLoom(loomPageId);
    const twitchVodPageId = twitchVodId(pageUrl);
    if (twitchVodPageId) pushTwitchVod(twitchVodPageId);
    const soundcloudPageUrl = soundcloudTrackUrl(pageUrl);
    if (soundcloudPageUrl) pushSoundcloud(soundcloudPageUrl);

    if (/(?:^|\.)coub\.com$/i.test(location.hostname)) {
      const coubJson = document.getElementById('coubPageCoubJson')?.textContent;
      for (const cand of coubMediaFromJson(coubJson)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)fanbox\.cc$/i.test(location.hostname)) {
      for (const cand of fanboxPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)tiktok\.com$/i.test(location.hostname)) {
      for (const cand of tiktokPageMedia()) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)patreon\.com$/i.test(location.hostname)) {
      for (const cand of patreonPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)erome\.com$/i.test(location.hostname)) {
      for (const cand of eromePageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)imgchest\.com$/i.test(location.hostname)) {
      for (const cand of imgchestPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)(?:kemono|coomer)\.(?:cr|su|st|party)$/i.test(location.hostname)) {
      for (const cand of kemonoPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)fapello\.(?:com|su)$/i.test(location.hostname)) {
      for (const cand of fapelloPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (CHEVERETO_HOST_RE.test(location.hostname)) {
      for (const cand of cheveretoPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)imgur\.(?:com|io)$/i.test(location.hostname)) {
      for (const cand of imgurPageMedia()) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)tenor\.com$/i.test(location.hostname)) {
      for (const cand of tenorPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)pexels\.com$/i.test(location.hostname)) {
      for (const cand of pexelsPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)xvideos[0-9]*\.com$/i.test(location.hostname)) {
      for (const cand of xvideosPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)xhamster[0-9]*\.(?:com|desi|one)$/i.test(location.hostname)) {
      for (const cand of xhamsterPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)pornhub\.com$/i.test(location.hostname)) {
      for (const cand of pornhubPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)lensdump\.com$/i.test(location.hostname)) {
      for (const cand of lensdumpPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)motherless\.com$/i.test(location.hostname)) {
      for (const cand of motherlessPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (isImageHost(location.hostname)) {
      for (const cand of imagehostsPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)imgpile\.com$/i.test(location.hostname)) {
      for (const cand of imgpilePageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }

    if (/(?:^|\.)(?:snootbooru\.com|bcbnsfw\.space)$/i.test(location.hostname)) {
      for (const cand of szurubooruPageMedia(pageUrl)) {
        pushCandidate(cand, cand.url, '', 0, 0);
      }
    }
  }

  for (const manifest of sniffedHlsManifests()) {
    if (isDashManifest(manifest)) pushDash(manifest, '');
    else pushHls(manifest, '');
  }

  const galleryKeys = new Set<string>();
  for (const m of media) if (m.resolveHint?.platform === 'gallery-page' && m.mediaKey) galleryKeys.add(m.mediaKey);
  if (galleryKeys.size) {
    for (let i = media.length - 1; i >= 0; i--) {
      const m = media[i];
      if (m.resolveHint?.platform !== 'gallery-page' && !m.mediaKey && galleryKeys.has(canonicalSrcKey(m.src))) {
        media.splice(i, 1);
      }
    }
  }

  return media;
}
