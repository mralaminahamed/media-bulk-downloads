/**
 * Pure, network-free helpers for everything derivable from an image URL string:
 * type detection (extension or query param), dimension parsing, and CDN upgrade
 * to the original asset. No requests are ever issued here.
 */
import { getImageType } from '@/extension/collect';

/** Normalizes a raw format token (extension or query value) to our type vocab. */
function normalizeFormat(raw: string): string {
  const ext = raw.toLowerCase();
  switch (ext) {
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
      return ext;
    default:
      return 'unknown';
  }
}

/**
 * Image type from the URL: file extension first, then `format=`/`fm=` query
 * params for extension-less dynamic CDN URLs. Falls back to 'unknown'.
 */
export function detectType(url: string): string {
  const byExt = getImageType(url);
  if (byExt !== 'unknown') return byExt;
  try {
    const params = new URL(url).searchParams;
    const fmt = params.get('format') ?? params.get('fm');
    if (fmt) return normalizeFormat(fmt);
  } catch {
    /* fall through */
  }
  return 'unknown';
}

/** A standalone `WxH` token, e.g. 360x480 — not part of a longer number run. */
const WxH = /(?<![\d])(\d{2,5})x(\d{2,5})(?![\d])/i;

/**
 * Best-effort pixel dimensions encoded in a URL. Handles `name=WxH`, bare `WxH`
 * size tokens (Shopify `_800x600`, generic), and `w=`/`h=` query params. Named
 * sizes (orig/large/scaled) and size-free URLs return null. A single known axis
 * yields the other as 0.
 */
export function parseUrlDimensions(url: string): { width: number; height: number } | null {
  const wh = url.match(WxH);
  if (wh) return { width: parseInt(wh[1], 10), height: parseInt(wh[2], 10) };

  try {
    const params = new URL(url).searchParams;
    const w = parseInt(params.get('w') ?? '', 10);
    const h = parseInt(params.get('h') ?? '', 10);
    if (Number.isFinite(w) || Number.isFinite(h)) {
      return { width: Number.isFinite(w) ? w : 0, height: Number.isFinite(h) ? h : 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** A CDN upgrade rule: match a URL by host/shape, then rewrite it to the original. */
interface CdnRule {
  match: (u: URL) => boolean;
  rewrite: (u: URL) => void;
}

/** Removes the named query params from a URL in place. */
function dropParams(u: URL, keys: string[]): void {
  keys.forEach((k) => u.searchParams.delete(k));
}

const RESIZE_PARAMS = ['w', 'h', 'fit', 'resize', 'quality', 'q', 'dpr', 'crop'];

const RULES: CdnRule[] = [
  {
    // Twitter/X: name=<size> -> name=orig, keep format.
    match: (u) => u.hostname === 'pbs.twimg.com',
    rewrite: (u) => {
      if (u.searchParams.has('name')) u.searchParams.set('name', 'orig');
    },
  },
  {
    // WordPress / Jetpack Photon.
    match: (u) => /(^|\.)wp\.com$/.test(u.hostname) || /\.files\.wordpress\.com$/.test(u.hostname),
    rewrite: (u) => {
      dropParams(u, RESIZE_PARAMS);
      u.pathname = u.pathname.replace(/-scaled(?=\.[a-z0-9]+$)/i, '');
    },
  },
  {
    // Shopify: strip a _WxH (or _WxH@2x) size suffix before the extension.
    match: (u) => u.hostname === 'cdn.shopify.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /_(?:\d{1,5}x\d{1,5}|\d{1,5}x|x\d{1,5})(@\dx)?(?=\.[a-z0-9]+$)/i,
        '',
      );
    },
  },
  {
    // Unsplash + Imgix: query-param resizers.
    match: (u) => u.hostname === 'images.unsplash.com' || /\.imgix\.net$/.test(u.hostname),
    rewrite: (u) => dropParams(u, RESIZE_PARAMS),
  },
  {
    // Cloudinary: remove the transform segment right after /upload/.
    match: (u) => u.hostname === 'res.cloudinary.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/upload\/[^/]*(?:w_|h_|c_|q_)[^/]*\//,
        '/upload/',
      );
    },
  },
  {
    // Wikimedia: /thumb/<path>/<size>px-<name> -> /<path>.
    match: (u) => u.hostname === 'upload.wikimedia.org' && u.pathname.includes('/thumb/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/thumb\//, '/').replace(/\/[^/]*px-[^/]+$/i, '');
    },
  },
];

/**
 * Upgrades a known CDN URL to its original asset. Returns the rewritten URL as
 * `original` with the input kept as `thumbnail` when a rule changed it; otherwise
 * `{ original: <input> }`. Conservative: a rewrite that empties the path or drops
 * the filename is discarded. Never throws.
 */
export function upgradeToOriginal(url: string): { original: string; thumbnail?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { original: url };
  }
  const rule = RULES.find((r) => r.match(parsed));
  if (!rule) return { original: url };

  const before = parsed.pathname;
  rule.rewrite(parsed);

  // Guard: a rewrite must not destroy the filename or empty the path.
  const filename = parsed.pathname.split('/').pop() ?? '';
  if (!parsed.pathname || parsed.pathname === '/' || !filename) {
    return { original: url };
  }

  const rewritten = parsed.href;
  if (rewritten === url && parsed.pathname === before) return { original: url };
  return { original: rewritten, thumbnail: url };
}
