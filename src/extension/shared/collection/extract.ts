/**
 * Deep, network-free DOM extraction: pulls candidate media URLs from lazy-load
 * attributes, best-srcset, <noscript> fallbacks, and <a href> gallery links.
 * Returns raw (unresolved) URL strings; collect.ts resolves/upgrades/dedups.
 */
import { parseSrcset } from '@/extension/shared/collection/imageUrl';
import { looksLikeMediaUrl, splitSrcsetCandidates } from '@/extension/shared/collection/imageUrl';

export interface UrlCandidate {
  url: string;
  thumbnailSrc?: string;
}

// Ordered by preference: whatever comes first becomes the element's primary
// candidate (index 0), which collect.ts pairs with the element's DOM dimensions.
// WordPress/Jetpack/Gutenberg expose the TRUE original in data-orig-file /
// data-large-file while `src` is a resized thumbnail — surface those first so the
// original wins without needing a CDN rule. The rest are real (not placeholder)
// lazy-load source attributes from common libraries; data-thumb/LQIP-style
// placeholder attributes are intentionally excluded.
const LAZY_SRC_ATTRS = [
  'data-orig-file', 'data-large-file',
  'data-src', 'data-original', 'data-original-src', 'data-actualsrc',
  'data-lazy-src', 'data-lazy', 'data-lazyload',
  'data-hi-res-src', 'data-src-large', 'data-full-src',
  'data-image', 'data-echo', 'data-flickity-lazyload',
];
const LAZY_SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
const LAZY_BG_ATTRS = ['data-bg', 'data-background', 'data-background-image'];

/**
 * Highest-resolution candidate in a srcset. Prefers the widest `w` descriptor;
 * for a pure-density srcset (`hi.jpg 2x, lo.jpg 1x`, no widths) prefers the
 * densest `x` instead of blindly returning the last entry.
 */
export function bestSrcsetUrl(srcset: string): string | null {
  const entries = splitSrcsetCandidates(srcset);
  if (!entries.length) return null;
  // A malformed descriptor (e.g. `1.2.3x`) parses to NaN; left as-is it poisons
  // best.w/x, and since every `NaN > best.w` comparison is false no later (valid,
  // higher-res) candidate could ever win. Coerce non-finite values to 0.
  const num = (s: string | undefined): number => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  let best: { url: string; w: number; x: number } | null = null;
  for (const e of entries) {
    const parts = e.split(/\s+/);
    const url = parts[0];
    const descr = parts.slice(1).join(' ');
    const w = num(descr.match(/([\d.]+)w/)?.[1]);
    const x = num(descr.match(/([\d.]+)x/)?.[1]);
    if (!best || w > best.w || (w === best.w && x > best.x)) best = { url, w, x };
  }
  return best?.url ?? null;
}

/** Ordered, de-duped raw URLs from an <img>/<source>-like element. */
export function imageUrlsFromElement(el: Element): string[] {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    if (u && !out.includes(u)) out.push(u);
  };

  for (const attr of LAZY_SRC_ATTRS) push(el.getAttribute(attr));
  push((el as HTMLImageElement).currentSrc || el.getAttribute('src'));
  for (const attr of LAZY_SRCSET_ATTRS) {
    const ss = el.getAttribute(attr);
    if (ss) {
      push(bestSrcsetUrl(ss));
      parseSrcset(ss).forEach(push);
    }
  }
  for (const attr of LAZY_BG_ATTRS) {
    const raw = el.getAttribute(attr);
    if (raw) {
      const m = raw.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
      push(m ? m[2] : raw);
    }
  }
  return out;
}

/** A gallery/lightbox link: full-res href over a thumbnail img. */
export function galleryLinkCandidate(a: HTMLAnchorElement): UrlCandidate | null {
  const href = a.getAttribute('href');
  if (!href) return null;
  let abs: string;
  try {
    abs = new URL(href, document.baseURI).href;
  } catch {
    return null;
  }
  if (!looksLikeMediaUrl(abs)) return null;
  const img = a.querySelector('img');
  const thumb = img ? (img as HTMLImageElement).currentSrc || img.getAttribute('src') || undefined : undefined;
  return thumb ? { url: href, thumbnailSrc: thumb } : { url: href };
}

/** <img> URLs hidden inside a <noscript> block (common no-JS lazy fallback). */
export function noscriptImageCandidates(ns: HTMLElement): UrlCandidate[] {
  let html = ns.textContent || '';
  // When scripting is enabled — every real browser tab a content script runs in,
  // and jsdom's `runScripts: 'dangerously'` — <noscript> is parsed as RAWTEXT, so
  // `textContent` returns the source with entities left un-decoded. Unescape once
  // as a fallback so a singly-escaped `&lt;img ...&gt;` is recognized the same as
  // `<img ...>`. (Only a scripting-disabled parse would
  // auto-decode, in which case this branch never fires.)
  if (!html.includes('<img') && html.includes('&lt;')) {
    html = html
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, '\'')
      .replace(/&amp;/g, '&');
  }
  if (!html.includes('<img')) return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return [];
  }
  const out: UrlCandidate[] = [];
  doc.querySelectorAll('img').forEach((img) => {
    const u = img.getAttribute('src');
    if (u) out.push({ url: u });
    const ss = img.getAttribute('srcset');
    if (ss) {
      const best = bestSrcsetUrl(ss);
      if (best) out.push({ url: best });
    }
  });
  return out;
}
