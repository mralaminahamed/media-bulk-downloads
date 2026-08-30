/**
 * Deep, network-free DOM extraction: pulls candidate media URLs from lazy-load
 * attributes, best-srcset, <noscript> fallbacks, and <a href> gallery links.
 * Returns raw (unresolved) URL strings; collect.ts resolves/upgrades/dedups.
 */
import { looksLikeMediaUrl, splitSrcsetCandidates } from '@mbd/core/collection/imageUrl';

export interface UrlCandidate {
  url: string;
  thumbnailSrc?: string;
  /** Intrinsic width from a srcset `w` descriptor, which the spec defines as the
   *  resource's real pixel width — the only size a lazy/alternate candidate
   *  reveals without loading it. Absent for `x` (density) descriptors, which say
   *  nothing about pixels. */
  width?: number;
}

const LAZY_SRC_ATTRS = [
  'data-orig-file', 'data-large-file',
  'data-src', 'data-original', 'data-original-src', 'data-actualsrc',
  'data-lazy-src', 'data-lazy', 'data-lazyload',
  'data-hi-res-src', 'data-src-large', 'data-full-src',
  'data-image', 'data-echo', 'data-flickity-lazyload',
  'data-url',
];
const LAZY_SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
const LAZY_BG_ATTRS = ['data-bg', 'data-background', 'data-background-image'];

/**
 * Highest-resolution candidate in a srcset. Prefers the widest `w` descriptor;
 * for a pure-density srcset (`hi.jpg 2x, lo.jpg 1x`, no widths) prefers the
 * densest `x` instead of blindly returning the last entry. A candidate with no
 * descriptor counts as `1x`, as the HTML spec defines it.
 */
export function bestSrcsetUrl(srcset: string): string | null {
  return bestSrcsetFrom(splitSrcsetCandidates(srcset));
}

/** Highest-resolution candidate from already-split srcset entries — lets
 *  imageUrlsFromElement split a srcset once instead of twice (best + full list). */
function bestSrcsetFrom(entries: string[]): string | null {
  if (!entries.length) return null;
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
    // A candidate with no descriptor is 1x per the HTML spec — scoring it 0
    // would let a 0.5x sibling win and pick the SMALLER image.
    const x = descr.includes('x') ? num(descr.match(/([\d.]+)x/)?.[1]) : 1;
    if (!best || w > best.w || (w === best.w && x > best.x)) best = { url, w, x };
  }
  return best?.url ?? null;
}

/** The `w` descriptor on a srcset entry, or undefined for `x`/bare entries. */
function widthOf(entry: string): number | undefined {
  const w = Number(entry.split(/\s+/).slice(1).join(' ').match(/([\d.]+)w/)?.[1]);
  return Number.isFinite(w) && w > 0 ? w : undefined;
}

/** Ordered, de-duped media candidates from an <img>/<source>-like element, each
 *  carrying its srcset `w` width when the markup declared one. */
export function imageUrlsFromElement(el: Element): UrlCandidate[] {
  const out: UrlCandidate[] = [];
  const seen = new Set<string>();
  const push = (u: string | null | undefined, width?: number) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(width === undefined ? { url: u } : { url: u, width });
  };

  for (const attr of LAZY_SRC_ATTRS) push(el.getAttribute(attr));
  push((el as HTMLImageElement).currentSrc || el.getAttribute('src'));
  for (const attr of LAZY_SRCSET_ATTRS) {
    const ss = el.getAttribute(attr);
    if (ss) {
      const cands = splitSrcsetCandidates(ss);
      const best = bestSrcsetFrom(cands);
      const byUrl = new Map(cands.map((c) => [c.split(/\s+/)[0], widthOf(c)]));
      push(best, best ? byUrl.get(best) : undefined);
      for (const c of cands) {
        const url = c.split(/\s+/)[0];
        push(url, widthOf(c));
      }
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

/**
 * Media URLs hidden inside a `<noscript>` block — the no-JS fallback a lazy
 * loader ships, and often the only place the FULL-size URL appears in the
 * markup. Re-parsed with DOMParser, then read with the same lazy-attribute and
 * srcset logic as a live element, so `data-src` and `<picture><source>` inside
 * the block are picked up too.
 */
export function noscriptImageCandidates(ns: HTMLElement): UrlCandidate[] {
  let html = ns.textContent || '';
  if (!html.includes('<img') && !html.includes('<source') && html.includes('&lt;')) {
    html = html
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, '\'')
      .replace(/&amp;/g, '&');
  }
  if (!html.includes('<img') && !html.includes('<source')) return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return [];
  }
  const out: UrlCandidate[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll('img, source').forEach((el) => {
    for (const cand of imageUrlsFromElement(el)) {
      if (seen.has(cand.url)) continue;
      seen.add(cand.url);
      out.push(cand);
    }
  });
  return out;
}
