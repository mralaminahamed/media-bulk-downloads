import { MediaCandidate } from '@mbd/core/resolvers/types';

/**
 * Shopify product resolver (pure core: no DOM, no network). Shopify runs on
 * millions of custom domains, so there is no host to pin the *resolver* to; the
 * content script detects a store product page and fetches the public, same-origin
 * `/products/<handle>.js` AJAX endpoint (see content/shopify-product.ts), then
 * feeds the parsed product here. This surfaces the COMPLETE media set — every
 * variant image plus product videos — that the passive `cdn.shopify.com` image
 * upgrade rule can't reach on its own (videos, and images the lazy/variant DOM
 * never renders). Keyed by product handle so `shopifyPageMedia(pageUrl)` reads it
 * synchronously from `collectMedia`, mirroring the pinterest/instagram/facebook
 * pageMedia stores.
 *
 * The endpoint JSON is UNTRUSTED (a same-origin response, but a compromised or
 * MITM'd store could return anything), so every field is re-validated and every
 * URL host-pinned before it becomes a candidate.
 */

interface ShopifyVideoSource {
  url?: unknown;
  mime_type?: unknown;
  format?: unknown;
  width?: unknown;
  height?: unknown;
}
interface ShopifyPreviewImage { src?: unknown; width?: unknown; height?: unknown }
interface ShopifyMedia {
  id?: unknown;
  media_type?: unknown; // 'image' | 'video' | 'external_video' | 'model'
  src?: unknown;
  preview_image?: ShopifyPreviewImage;
  sources?: unknown;
  width?: unknown;
  height?: unknown;
}
interface ShopifyProduct { media?: unknown }

// Shopify serves product media from its own CDN families; a store on a custom
// domain also serves images from its OWN origin under /cdn/shop/, so the page's
// host is accepted too. Anything else in the (untrusted) JSON is rejected.
const SHOPIFY_CDN = /(?:^|\.)(?:shopify\.com|shopifycdn\.com|shopifycdn\.net)$/i;

/** Resolve a media URL (absolute or protocol-relative `//host/…`) and accept it
 *  only when https and on a Shopify CDN family or the page's own host. */
function pinShopifyUrl(raw: unknown, pageHost: string): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const abs = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const u = new URL(abs);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    return SHOPIFY_CDN.test(host) || host === pageHost.toLowerCase() ? u.href : null;
  } catch {
    return null;
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

const MP4_MIME = /video\/mp4/i;
const HLS_MIME = /x-mpegurl|vnd\.apple\.mpegurl/i;

/** The best downloadable source for a video media entry: the highest-resolution
 *  progressive mp4, else the HLS master (captured as a stream). null when neither. */
function bestVideoSource(sources: unknown, pageHost: string): { url: string; ext: 'mp4' | 'm3u8'; width?: number; height?: number } | null {
  if (!Array.isArray(sources)) return null;
  let bestMp4: { url: string; width?: number; height?: number; h: number } | null = null;
  let hls: string | null = null;
  for (const raw of sources) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as ShopifyVideoSource;
    const url = pinShopifyUrl(s.url, pageHost);
    if (!url) continue;
    const isMp4 = s.format === 'mp4' || (typeof s.mime_type === 'string' && MP4_MIME.test(s.mime_type)) || /\.mp4(?:$|[?#])/i.test(url);
    const isHls = s.format === 'm3u8' || (typeof s.mime_type === 'string' && HLS_MIME.test(s.mime_type)) || /\.m3u8(?:$|[?#])/i.test(url);
    if (isMp4) {
      const h = num(s.height) ?? 0;
      if (!bestMp4 || h > bestMp4.h) bestMp4 = { url, width: num(s.width), height: num(s.height), h };
    } else if (isHls && !hls) {
      hls = url;
    }
  }
  if (bestMp4) return { url: bestMp4.url, ext: 'mp4', width: bestMp4.width, height: bestMp4.height };
  return hls ? { url: hls, ext: 'm3u8' } : null;
}

/** Map a validated Shopify product's `media[]` to candidates. Images use their own
 *  `src` (the passive `cdn.shopify.com` rule later upgrades the size token to the
 *  original); videos use the best mp4/HLS source with the preview as poster.
 *  external_video (YouTube/Vimeo embeds) and model (3D) have no direct file → skipped. */
export function extractShopifyMedia(product: unknown, pageHost: string): MediaCandidate[] {
  const media = (product as ShopifyProduct | null)?.media;
  if (!Array.isArray(media)) return [];
  const out: MediaCandidate[] = [];
  for (const raw of media) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as ShopifyMedia;
    const idPart = typeof m.id === 'number' || typeof m.id === 'string' ? String(m.id) : '';
    const mediaKey = idPart ? `shopify:${idPart}` : undefined;
    const type = typeof m.media_type === 'string' ? m.media_type : '';

    if (type === 'image' || (!type && m.src)) {
      const url = pinShopifyUrl(m.src ?? m.preview_image?.src, pageHost);
      if (!url) continue;
      const c: MediaCandidate = { url, kind: 'image' };
      const w = num(m.width) ?? num(m.preview_image?.width);
      const h = num(m.height) ?? num(m.preview_image?.height);
      if (w) c.width = w;
      if (h) c.height = h;
      if (mediaKey) c.mediaKey = mediaKey;
      out.push(c);
    } else if (type === 'video') {
      const best = bestVideoSource(m.sources, pageHost);
      if (!best) continue;
      const c: MediaCandidate = { url: best.url, kind: 'video', ext: best.ext };
      const poster = pinShopifyUrl(m.preview_image?.src, pageHost);
      if (poster) c.poster = poster;
      const w = best.width ?? num(m.width) ?? num(m.preview_image?.width);
      const h = best.height ?? num(m.height) ?? num(m.preview_image?.height);
      if (w) c.width = w;
      if (h) c.height = h;
      if (mediaKey) c.mediaKey = mediaKey;
      out.push(c);
    }
    // external_video / model / unknown → no downloadable file, skipped.
  }
  return out;
}

// Product media keyed by handle, filled by the content-script fetch. Bounded by
// the number of distinct products visited in one SPA session (small).
const HANDLE_CAP = 200;
const store = new Map<string, MediaCandidate[]>();

/** The product handle in a `/products/<handle>` URL (also matches
 *  `/collections/<c>/products/<handle>`), stripped of a `.js` suffix, or null. */
const HANDLE_RE = /\/products\/([^/?#]+)/;
export function shopifyProductHandle(pageUrl?: string): string | null {
  if (!pageUrl) return null;
  try {
    const m = new URL(pageUrl).pathname.match(HANDLE_RE);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/\.js$/i, '') || null;
  } catch {
    return null;
  }
}

/** Feed a fetched product's media into the store, keyed by handle. Validates +
 *  host-pins via extractShopifyMedia. No-op when nothing valid resolves. */
export function ingestShopifyProduct(handle: string, product: unknown, pageHost: string): void {
  if (!handle) return;
  const cands = extractShopifyMedia(product, pageHost);
  if (!cands.length) return;
  store.delete(handle); // re-insert as newest for the LRU cap
  store.set(handle, cands);
  for (const h of [...store.keys()].slice(0, Math.max(0, store.size - HANDLE_CAP))) store.delete(h);
}

/** Every media for the product at `pageUrl` (a `/products/<handle>` URL), or []. */
export function shopifyPageMedia(pageUrl?: string): MediaCandidate[] {
  const handle = shopifyProductHandle(pageUrl);
  return handle ? store.get(handle) ?? [] : [];
}

/** Test-only: drop the store so cases start clean. */
export function __resetShopify(): void {
  store.clear();
}
