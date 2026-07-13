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
import { detectType, parseUrlDimensions } from '@/extension/shared/collection/imageUrl';
import { classifyPage, collectPageSignals } from '@/extension/shared/collection/pageType';
import { detectAvType, isUndownloadableMedia, isHlsManifest, isDashManifest } from '@/extension/shared/collection/mediaType';
import { imageUrlsFromElement, galleryLinkCandidate, noscriptImageCandidates, bestSrcsetUrl } from '@/extension/shared/collection/extract';
import { canonicalSrcKey } from '@/extension/shared/collection/canonical';
import { resolve, MediaCandidate } from '@/extension/shared/resolvers';
import { twitterGifCandidate, twitterVideoPending } from '@/extension/shared/resolvers/sites/twitter';
import { instagramPageMedia } from '@/extension/shared/resolvers/sites/instagram';
import { facebookPageMedia } from '@/extension/shared/resolvers/sites/facebook';
import { pinterestPageMedia } from '@/extension/shared/resolvers/sites/pinterest';
import { youtubeVideoId } from '@/extension/shared/resolvers/sites/youtube';
import { vimeoVideoId } from '@/extension/shared/resolvers/sites/vimeo';
import { dailymotionVideoId } from '@/extension/shared/resolvers/sites/dailymotion';
import { sniffedHlsManifests } from '@/extension/shared/resolvers/sniffers/hls-sniff';
import { HOST_ID } from '@/extension/bubble/mount';

/** Determines if a URL is a base64-encoded image. */
export function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/');
}

/** Extracts the image type from a base64 data URI. */
export function getBase64ImageType(src: string): string {
  // The subtype ends at the first `;` (…;base64,) or `,` (URL-encoded, no base64),
  // so match either — otherwise an inline `data:image/svg+xml,<svg…>` reads as
  // 'unknown'. Normalise `svg+xml` to the 'svg' that getImageType emits for .svg
  // files, so the toolbar's imageType='svg' filter matches inline/base64 SVGs too.
  const match = src.match(/^data:image\/([\w.+-]+)\s*[;,]/i);
  if (!match) return 'unknown';
  const type = match[1].toLowerCase();
  return type === 'svg+xml' ? 'svg' : type;
}

/** Calculates the size of a base64-encoded image in bytes. */
export function getBase64ImageSize(src: string): number {
  // Only a genuinely base64 data URI has a computable byte length here. A
  // URL-encoded data URI (e.g. `data:image/svg+xml,<svg viewBox="0,0,8,8">…`)
  // is not base64 and its payload can contain commas, so split(',')[1] would be
  // a truncated fragment and the length formula pure nonsense — report 0 instead.
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

// `getImageType` and `parseSrcset` are pure URL/string helpers that live in the
// browser-agnostic collection layer. They are re-exported here so the content
// script (and its tests) keep a stable import surface without the collection
// layer having to depend back on the content script.
export { getImageType, parseSrcset } from '@/extension/shared/collection/imageUrl';

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
  // The `<res>x`/`<res>dppx` descriptor is optional — a candidate written without
  // one (e.g. `image-set("a.png" type("image/png"))`) defaults to 1, so it must
  // still match rather than be dropped.
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
    // Walk to the matching close paren (url() candidates contain their own parens).
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
export function collectMedia(scanRoots?: ScanRoot[], opts?: { smartPageDefaults?: boolean }): MediaItem[] {
  const incremental = scanRoots !== undefined;
  const media: MediaItem[] = [];
  // Dedup by CANONICAL src key, not the raw URL, so the same image served from
  // two rotating CDN edge hosts / signed queries in one scan yields one tile.
  const seenKeys = new Set<string>();
  const seenSources = {
    has: (url: string): boolean => seenKeys.has(canonicalSrcKey(url)),
    add: (url: string): void => { seenKeys.add(canonicalSrcKey(url)); },
  };
  const pageUrl = location.href;

  // Maps a resolved candidate to a MediaItem/ImageInfo, preserving the dimension
  // fallback and dedup semantics of the pre-registry implementation.
  const pushCandidate = (
    cand: MediaCandidate, resolved: string, alt: string, width: number, height: number, thumbnailOverride?: string,
  ): void => {
    if (seenSources.has(cand.url)) return;
    seenSources.add(cand.url);

    if (cand.kind === 'video' || cand.kind === 'gif') {
      // A resolver can hand back a streaming manifest (Pinterest's HLS master when
      // no progressive mp4 exists, etc.) as an ordinary video candidate — it is not
      // a single downloadable file, so it must route through the same capture path
      // (`hlsManifest`) as pushHls/pushDash, or it silently bypasses the user's
      // captureHlsStreams opt-in and downloads as a broken manifest file.
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

    // A resolver-supplied true size (e.g. Wallhaven's grid resolution) wins;
    // otherwise DOM dimensions win; otherwise fall back to whatever the URL
    // encodes. The upgraded candidate URL often has its size hint stripped away
    // (that's the point of the upgrade), so also try the pre-upgrade `resolved`
    // URL, which still carries the thumbnail's size token (e.g. Shopify
    // `_800x600`, Twitter `name=360x360`).
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
    // The resolver knows the true file extension (e.g. Wallhaven .jpg vs the
    // canonical 'jpeg' type); carry it so the download keeps the real extension.
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

    for (const cand of resolve(resolved, { el, allowNetwork: false, pageUrl })) {
      pushCandidate(cand, resolved, alt, width, height, thumbnailOverride);
    }
  };

  // Computed once, applied to every scanned root: jsdom has no layout engine —
  // every element reports 0×0 — so the not-rendered guard below is only safe to
  // apply when the document actually has layout, otherwise it would skip every
  // element under test.
  const hasLayout =
    (document.documentElement?.offsetHeight ?? 0) > 0 || (document.body?.offsetHeight ?? 0) > 0;

  // <video> and <audio> — direct-file sources only. Streaming manifests and
  // blob: URLs are skipped (chrome.downloads can't fetch them as one file).
  // An HLS manifest (.m3u8) surfaced as a capturable video: it is not a single
  // file, but the HLS engine can fetch + assemble its segments. `src` holds the
  // manifest URL for preview/keying; `hlsManifest` marks it for the capture path
  // so it is never handed to chrome.downloads directly.
  const pushHls = (resolved: string, alt: string, posterUrl?: string): void => {
    if (seenSources.has(resolved)) return;
    seenSources.add(resolved);
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
    if (seenSources.has(resolved)) return;
    seenSources.add(resolved);
    const item: MediaItem = {
      src: resolved, alt, width: 0, height: 0,
      type: 'mpd', fileSize: 0, isBase64: false, kind: 'video',
      hlsManifest: resolved,
    };
    if (posterUrl && /^(https?:|data:image\/)/i.test(posterUrl)) item.poster = posterUrl;
    media.push(item);
  };

  // A Vimeo video (embed iframe or link) surfaced as a pending video: Vimeo hides
  // the file behind its player config, so the real mp4 is fetched on the opt-in
  // resolve pass (resolveHint 'vimeo'), like a Twitter video. Keyed by the canonical
  // watch URL so an embed + a link to the same video collapse to one item.
  const pushVimeo = (id: string): void => {
    const watch = `https://vimeo.com/${id}`;
    if (seenSources.has(watch)) return;
    seenSources.add(watch);
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'vimeo', id },
    });
  };

  // A Dailymotion video (embed iframe or link) surfaced as a pending video:
  // Dailymotion hides the file behind its player metadata, so the real HLS
  // master is fetched on the opt-in resolve pass (resolveHint 'dailymotion'),
  // like a Vimeo video. Keyed by the canonical watch URL so an embed + a link
  // to the same video collapse to one item.
  const pushDailymotion = (id: string): void => {
    const watch = `https://www.dailymotion.com/video/${id}`;
    if (seenSources.has(watch)) return;
    seenSources.add(watch);
    media.push({
      src: watch, alt: '', width: 0, height: 0, type: 'mp4',
      fileSize: 0, isBase64: false, kind: 'video',
      unresolvedVideo: true, resolveHint: { platform: 'dailymotion', id },
    });
  };

  // X/Twitter unpainted grid cells: a `/user/status/<id>/photo|video/<n>` link
  // whose cell never rendered a real pbs.twimg.com media <img> (or a mounted
  // <video>'s poster) — common on a fast scroll through a lazy-loading grid,
  // which leaves the anchor in the DOM with nothing painted inside it yet. Emits
  // a PENDING item (unresolvedImage / unresolvedVideo) keyed by the anchor's own
  // status id + index, so the opt-in resolve pass (resolveOriginals) can still
  // recover the original via the syndication endpoint (network.ts's twitter()
  // photo branch / existing video branch). A cell that DID paint is already
  // collected by the <img>/<video> passes above — this only fills the gap, it
  // never duplicates. Gated to x.com/twitter.com so an unrelated site's own
  // `/status/<n>` path segment is never scanned. `twitterPendingSeen` only
  // dedupes within this single collectMedia() call (e.g. two anchors sharing a
  // status id); cross-scan/deep-scan dedup already happens at the caller via
  // canonicalSrcKey on `src`, which is this item's stable status-permalink URL.
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

    // Already painted — a real media <img> or a mounted <video>'s poster inside
    // this cell — the existing img/video passes above already collected it.
    const painted =
      [...a.querySelectorAll('img[src]')].some((img) => TWITTER_PAINTED_MEDIA.test(img.getAttribute('src') || '')) ||
      [...a.querySelectorAll('video[poster]')].some((v) => TWITTER_PAINTED_MEDIA.test(v.getAttribute('poster') || ''));
    if (painted) return;

    if (seenSources.has(resolvedHref)) return;
    seenSources.add(resolvedHref);
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

  const collectAv = (
    rawSrc: string,
    kind: 'video' | 'audio',
    mime: string | undefined,
    alt: string,
    posterUrl?: string,
  ): void => {
    if (!rawSrc) return;
    const resolved = resolveUrl(rawSrc);
    // HLS/DASH capture applies to <audio> manifests too (audio-only .m3u8/.mpd,
    // e.g. live radio) — not just <video>. Without this they fall through to
    // isUndownloadableMedia and are silently dropped regardless of the setting.
    if (isHlsManifest(resolved) && /^https?:\/\//i.test(resolved)) {
      pushHls(resolved, alt, posterUrl);
      return;
    }
    if (isDashManifest(resolved) && /^https?:\/\//i.test(resolved)) {
      pushDash(resolved, alt, posterUrl);
      return;
    }
    if (isUndownloadableMedia(resolved)) return;
    // Only real http(s) files are downloadable; drop javascript:/data:/other
    // schemes that isUndownloadableMedia (blob/streams only) doesn't cover.
    if (!/^https?:\/\//i.test(resolved)) return;
    if (seenSources.has(resolved)) return;
    seenSources.add(resolved);
    const item: MediaItem = {
      src: resolved, alt, width: 0, height: 0,
      type: detectAvType(resolved, mime),
      fileSize: 0, isBase64: false, kind,
    };
    if (kind === 'video' && posterUrl && /^(https?:|data:image\/)/i.test(posterUrl)) item.poster = posterUrl;
    media.push(item);
  };

  // Media inside open shadow DOM (web components) and same-origin <iframe>s is
  // invisible to a document-only querySelectorAll, so scan the top document plus
  // every open shadow root and reachable same-origin frame document. Extra roots
  // are discovered while walking (shadow roots during the '*' pass, frames via a
  // dedicated pass) and appended through addRoot, which dedups so a self- or
  // cross-referencing frame can't loop. Closed shadow roots and cross-origin
  // frames are inaccessible by design (contentDocument null/throws) and skipped.
  const roots: ScanRoot[] = scanRoots ?? [document];
  const seenRoots = new Set<ScanRoot>(roots);
  const addRoot = (r: Document | ShadowRoot | null | undefined): void => {
    if (r && !seenRoots.has(r)) {
      seenRoots.add(r);
      roots.push(r);
    }
  };

  const scanRoot = (root: ScanRoot): void => {
    // Resolve computed style against the element's own window so background-image
    // reads work for elements in a same-origin frame document, not just the top one.
    const isElement = root.nodeType === 1;
    const ownerDoc = root.nodeType === 9
      ? (root as Document)
      : (root as ShadowRoot | Element).ownerDocument;
    const view = ownerDoc.defaultView ?? window;

    // ONE traversal per root. The '*' walk is mandatory anyway (background-image
    // needs getComputedStyle on every element), so bucket the media tags and
    // discover open shadow roots in the same pass instead of firing a separate
    // full-subtree querySelectorAll for each of img/picture/video/audio/a/noscript/
    // iframe. That turned eight walks of the DOM into one — a real saving on big
    // pages, and in deep scan where scanRoot re-runs every scroll round.
    const imgs: HTMLImageElement[] = [];
    const pictures: Element[] = [];
    const videos: HTMLVideoElement[] = [];
    const audios: HTMLAudioElement[] = [];
    const anchors: HTMLAnchorElement[] = [];
    const noscripts: HTMLElement[] = [];
    const iframes: HTMLIFrameElement[] = [];
    const backgrounds: [Element, string][] = [];

    // An element root includes ITSELF plus descendants; a Document/ShadowRoot
    // root contributes only descendants (it cannot itself be media).
    const els: HTMLElement[] = isElement
      ? [root as HTMLElement, ...Array.from((root as Element).querySelectorAll<HTMLElement>('*'))]
      : Array.from(root.querySelectorAll<HTMLElement>('*'));
    els.forEach((el) => {
      // Discover open shadow roots regardless of layout (a not-rendered host can
      // still contain visible media once its component mounts) — EXCEPT our own
      // on-page bubble (mount.tsx's `#ibd-bubble-host`, an open shadow root by
      // necessity for its own styling). Without this exclusion a re-scan while
      // the bubble is showing a not-yet-upgraded grid thumbnail "discovers" that
      // thumbnail as if it were new page content and re-adds it — untagged (the
      // bubble's own markup has no enclosing page anchor for a resolver to key
      // off of) — once the real page resolves to a different (upgraded) URL, so
      // resolvers that tag a `mediaKey` (Task 8) could never actually dedupe an
      // in-place upgrade while the panel is open.
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

      // CSS background-image (handles multiple comma-separated layers). Resolving
      // computed style for every element is the deep-scan hot path, so skip
      // elements that aren't rendered (display:none / 0×0 can't show a background).
      if (hasLayout && el.offsetWidth === 0 && el.offsetHeight === 0) return;
      const bgImage = view.getComputedStyle(el).getPropertyValue('background-image');
      if (bgImage && bgImage !== 'none') backgrounds.push([el, bgImage]);
    });

    // Process the buckets in the same order the separate passes used to run, so
    // dedup priority (first-seen src wins its dimensions/thumbnail) is unchanged:
    // img → picture → background → video → audio → link → noscript → frame.

    // <img> tags and their srcset. The measured dimensions belong to whatever the
    // element is actually displaying (currentSrc/src) — not to a higher-res original
    // pulled from data-orig-file/data-large-file, which imageUrlsFromElement returns
    // FIRST. Tagging that original with the on-screen thumbnail's size mislabels it
    // and lets the minimum-size filter wrongly drop a genuinely large image.
    imgs.forEach((img) => {
      const { width, height } = getImageDimensions(img);
      const loaded = img.currentSrc || img.src;
      imageUrlsFromElement(img).forEach((src) => {
        const isLoaded = resolveUrl(src) === loaded;
        collectImageInfo(src, img.alt, isLoaded ? width : 0, isLoaded ? height : 0, undefined, img);
      });
    });

    // <picture> elements: only the <source srcset> variants here — the fallback
    // <img> is already covered by the img pass above (results dedup), so re-scanning
    // it would just repeat work.
    pictures.forEach((picture) => {
      picture.querySelectorAll('source').forEach((source) => {
        imageUrlsFromElement(source).forEach((src) => collectImageInfo(src, '', 0, 0, undefined, source));
      });
    });

    // Pass the element so a resolver can read its context (e.g. a Twitter video
    // poster set as a background-image finds the cell's /status/ link). image-set
    // layers contribute only their highest-resolution candidate.
    backgrounds.forEach(([el, bgImage]) => {
      for (const url of backgroundImageUrls(bgImage)) {
        collectImageInfo(url, '', 0, 0, undefined, el);
      }
    });

    videos.forEach((video) => {
      const gif = twitterGifCandidate(video);
      if (gif && !seenSources.has(gif.url)) {
        seenSources.add(gif.url);
        media.push({
          src: gif.url, alt: '', width: 0, height: 0,
          type: 'mp4', fileSize: 0, isBase64: false, kind: 'video', poster: gif.poster,
        });
      }

      const pendingVid = twitterVideoPending(video, pageUrl);
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
      // Try each source rather than short-circuiting on currentSrc: a blob:-backed
      // currentSrc would otherwise mask a genuinely downloadable mp4 in data-src.
      // collectAv dedups and drops undownloadable entries, so redundant tries are free.
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

    // Gallery / lightbox links: full-res <a href> over a thumbnail <img>.
    anchors.forEach((a) => {
      const c = galleryLinkCandidate(a);
      if (c) collectImageInfo(c.url, '', 0, 0, c.thumbnailSrc, a.querySelector('img') ?? a);
      // A link to a YouTube video (even a bare text link, no <img>) — surface the
      // video's public poster thumbnail. Gated to real video ids so ordinary
      // links don't get force-collected as images.
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
      // An X/Twitter status permalink (`/user/status/<id>/photo|video/<n>`) whose
      // cell never painted its media — surface a pending item resolved on demand.
      else if (isTwitterPage && resolvedHref) pushTwitterPending(a, resolvedHref);
    });

    // <noscript> fallbacks (real image often lives here for no-JS users).
    noscripts.forEach((ns) => {
      noscriptImageCandidates(ns).forEach((c) => collectImageInfo(c.url, '', 0, 0, c.thumbnailSrc));
    });

    // Same-origin <iframe> documents — descend into reachable frames. Accessing
    // contentDocument throws or returns null for cross-origin frames; guard and
    // skip those. Nested same-origin frames are reached because their document is
    // scanned in turn.
    iframes.forEach((frame) => {
      // A YouTube <iframe> embed (cross-origin, so its document is unreachable
      // below) still exposes the video id in its src — surface the public poster.
      // Covers lazy embeds that keep the real URL in data-src until scrolled.
      const embedSrc = frame.getAttribute('src') || frame.getAttribute('data-src') || '';
      const resolvedEmbed = embedSrc ? resolveUrl(embedSrc) : '';
      if (resolvedEmbed && youtubeVideoId(resolvedEmbed)) collectImageInfo(embedSrc, '', 0, 0, undefined, frame);
      // A Vimeo player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && vimeoVideoId(resolvedEmbed)) pushVimeo(vimeoVideoId(resolvedEmbed)!);
      // A Dailymotion player <iframe> — surface as a pending video (resolved on demand).
      else if (resolvedEmbed && dailymotionVideoId(resolvedEmbed)) pushDailymotion(dailymotionVideoId(resolvedEmbed)!);

      let doc: Document | null;
      try {
        doc = frame.contentDocument;
      } catch {
        doc = null;
      }
      addRoot(doc);
    });
  };

  // Page-type prior (opt-in via smartPageDefaults, full scans only): a
  // single-media/article page's meta/preload hero image is usually the one
  // full-res representation of the page's subject, while any inline <img> is
  // often a smaller thumbnail of that SAME asset (e.g. a lightbox trigger, an
  // OG-card preview). Running the hero passes before the DOM walk lets the
  // hero win first-come dedup instead of the thumbnail. Off (or page type
  // unclassified), this changes nothing — see the `if (!heroFirst)` calls
  // below, which restore each pass to its original position relative to the
  // DOM walk and the og:video pass.
  const pageType = !incremental && opts?.smartPageDefaults
    ? classifyPage(collectPageSignals(document))
    : 'unknown';
  const heroFirst = pageType === 'single-media' || pageType === 'article';

  // Meta hero images: og:image and twitter:image often point at the
  // highest-resolution hero that never appears as an <img> on the page.
  // These live in the top document head only; dedup + CDN upgrade run as
  // usual via collectImageInfo.
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

  // Preloaded images: <link rel=preload as=image> often points at the
  // highest-resolution hero the page will render, ahead of it ever appearing
  // as an <img>. Kept as its own pass (separate from collectHeroMeta) so the
  // OFF path can slot it back in after the og:video pass, exactly where it
  // ran before hero-first reordering existed.
  const collectPreloadImages = (): void => {
    document.querySelectorAll('link[rel~="preload"][as="image"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href) collectImageInfo(href);
      // <link rel=preload as=image imagesrcset> — take the highest-width candidate.
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

  // Grows as scanRoot() discovers open shadow roots; the index loop picks them up.
  for (let i = 0; i < roots.length; i++) scanRoot(roots[i]);

  if (!incremental) {
    // Today's order (heroFirst false / page type unclassified): the meta hero
    // pass runs here, after the DOM walk, exactly as it always has.
    if (!heroFirst) collectHeroMeta();

    // og:video: some pages (news, product, embeds) expose a direct downloadable
    // mp4 in <meta property="og:video"> that never appears as a <video> element.
    // collectAv surfaces streaming manifests (.m3u8/.mpd) as capturable stream
    // items routed to the HLS/DASH engines; only blob: URLs and other
    // undownloadable media are dropped. og:video:type supplies the mime;
    // og:image is its poster.
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

    // Today's order (heroFirst false / page type unclassified): the preload
    // pass runs here, after og:video, exactly as it always has.
    if (!heroFirst) collectPreloadImages();

    // Instagram single-post/reel pages: surface the whole post from its page JSON
    // (all carousel slides + the real mp4), covering media the DOM hides —
    // virtualized carousel slides and `blob:`-backed reel videos. No-ops on a
    // profile grid (no shortcode in the URL); deduped against the walk above.
    for (const cand of instagramPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }

    // Facebook opened photo/video: surface the full-res original / real mp4 from
    // the page's own GraphQL/hydration, covering media the DOM hides (viewer
    // blob:, virtualized album). No-ops off a photo/video page; deduped by
    // canonicalSrcKey against the walk above.
    for (const cand of facebookPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }

    // Pinterest opened pin / feed: surface the sniffed pins (orig image, real mp4,
    // every carousel slide) for the pin at the page URL, covering media the
    // virtualized/unhydrated grid hides. No-ops off a /pin/ page; deduped by
    // canonicalSrcKey against the walk above.
    for (const cand of pinterestPageMedia(pageUrl)) {
      pushCandidate(cand, cand.url, '', cand.width ?? 0, cand.height ?? 0);
    }
  }

  // HLS manifests the MAIN-world sniffer caught (hls.js / native players fetch
  // the .m3u8 via XHR, so it never appears in the DOM). Surfaced as capturable
  // streams; pushHls dedupes against any manifest already found in the DOM.
  for (const manifest of sniffedHlsManifests()) {
    if (isDashManifest(manifest)) pushDash(manifest, '');
    else pushHls(manifest, '');
  }

  return media;
}
