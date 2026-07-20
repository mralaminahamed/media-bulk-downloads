import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

function imgTags(html: string): string[] {
  return html.match(/<img\b[^>]*>/gi) ?? [];
}
function srcOf(tag: string): string | null {
  return (
    /\bsrc\s*=\s*"([^"]+)"/i.exec(tag)?.[1] ??
    /\bsrc\s*=\s*'([^']+)'/i.exec(tag)?.[1] ??
    null
  );
}
function imgById(html: string, id: string): string | null {
  const idRe = new RegExp(`\\bid\\s*=\\s*["']${id}["']`, 'i');
  for (const t of imgTags(html)) if (idRe.test(t)) return srcOf(t);
  return null;
}
function imgByClass(html: string, cls: string): string | null {
  const clsRe = new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b`, 'i');
  for (const t of imgTags(html)) if (clsRe.test(t)) return srcOf(t);
  return null;
}
function imgOnCdn(html: string, cdn: RegExp, exclude?: RegExp): string | null {
  for (const t of imgTags(html)) {
    const s = srcOf(t);
    if (s && cdn.test(s) && !(exclude && exclude.test(s))) return s;
  }
  return null;
}
function ogBig(html: string): string | null {
  const og =
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i.exec(html)?.[1];
  return og ? og.replace('/small/', '/big/') : null;
}
function imgInContainer(html: string, id: string): string | null {
  const m = new RegExp(`id\\s*=\\s*["']${id}["'][\\s\\S]{0,400}?<img\\b[^>]*>`, 'i').exec(html);
  return m ? srcOf(m[0]) : null;
}

interface ImageHostRule {
  host: RegExp;
  path: RegExp;
  extract: (html: string) => string | null;
}

const RULES: ImageHostRule[] = [
  {
    host: /^(?:www\.)?(?:imgdrive\.net|imgtaxi\.(?:com|net)|imgwallet\.(?:com|net))$/i,
    path: /^\/img-[a-z0-9]+\.html$/i,
    extract: ogBig,
  },
  { host: /^(?:www\.)?imgspice\.com$/i, path: /\.html$/i, extract: (h) => imgById(h, 'imgpreview') },
  { host: /^(?:www\.)?imgpv\.com$/i, path: /\.html$/i, extract: (h) => imgById(h, 'img-preview') },
  { host: /^(?:www\.)?picstate\.com$/i, path: /^\/view\/full\//i, extract: (h) => imgInContainer(h, 'image_container') },
  {
    host: /(?:^|\.)imagebam\.com$/i,
    path: /^\/(?:view|image)\//i,
    extract: (h) => imgOnCdn(h, /^https?:\/\/images\d*\.imagebam\.com\//i),
  },
  {
    host: /(?:^|\.)imagevenue\.com$/i,
    path: /^\/[A-Za-z0-9]{6,}\/?$|^\/view\//i,
    extract: (h) => imgOnCdn(h, /^https?:\/\/img\d+\.imagevenue\.com\//i, /loader\.svg/i),
  },
  { host: /(?:^|\.)pixhost\.to$/i, path: /^\/show\//i, extract: (h) => imgByClass(h, 'image-img') },
  {
    host: /(?:^|\.)(?:imagetwist|imagehaha)\.com$/i,
    path: /^\/[a-z0-9]{8,}\/?$/i,
    extract: (h) => imgOnCdn(h, /^https?:\/\/img\d+\.(?:imagetwist|imagehaha)\.com\//i, /\/imgs\//i),
  },
];

function sameSite(srcHost: string, pageHost: string): boolean {
  const base = pageHost.split('.').slice(-2).join('.');
  return srcHost === pageHost || srcHost === base || srcHost.endsWith(`.${base}`);
}

/** Find the image-host rule matching a page URL, or null. */
function ruleFor(u: URL): ImageHostRule | null {
  const host = u.hostname.toLowerCase();
  return RULES.find((r) => r.host.test(host) && r.path.test(u.pathname)) ?? null;
}

/** True when `hostname` belongs to a supported image host (collect.ts gate). */
export function isImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return RULES.some((r) => r.host.test(h));
}

/**
 * Extract a supported image host's original from its single-image page markup
 * (network-free). The per-host rule reads the original (og:image / a specific
 * `<img>` / a CDN `<img>`); the result must be a plaintext `https` image on the same
 * site (relative URLs are resolved against the page). A non-image page, a gate
 * interstitial, or an off-site URL yields `[]` (fails closed). One candidate/page.
 */
export function imageHostMedia(pageUrl: string, html: string): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return [];
  }
  const rule = ruleFor(u);
  if (!rule) return [];
  const raw = rule.extract(html);
  if (!raw) return [];
  let mediaUrl: URL;
  try {
    mediaUrl = new URL(raw, u.href);
  } catch {
    return [];
  }
  if (mediaUrl.protocol !== 'https:' || !sameSite(mediaUrl.hostname.toLowerCase(), u.hostname.toLowerCase())) return [];
  const ext = imageExtFromUrl(mediaUrl.href);
  if (!ext) return [];
  return [
    {
      url: mediaUrl.href,
      kind: ext === 'gif' ? 'gif' : 'image',
      ext,
      mediaKey: `imghost ${u.hostname}${u.pathname}`,
    },
  ];
}

/**
 * Reads the current image-host page's original from the DOM (network-free), for
 * `collectMedia`. No-ops off a supported single-image page.
 */
export function imagehostsPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  if (typeof document === 'undefined') return [];
  return imageHostMedia(src, document.documentElement.innerHTML);
}
