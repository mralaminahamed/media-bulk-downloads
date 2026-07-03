/**
 * Deep, network-free DOM extraction: pulls candidate media URLs from lazy-load
 * attributes, best-srcset, <noscript> fallbacks, and <a href> gallery links.
 * Returns raw (unresolved) URL strings; collect.ts resolves/upgrades/dedups.
 */
import { parseSrcset } from '@/extension/collect';
import { looksLikeMediaUrl } from '@/extension/shared/imageUrl';

export interface UrlCandidate {
  url: string;
  thumbnailSrc?: string;
}

const LAZY_SRC_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-hi-res-src', 'data-full-src', 'data-image'];
const LAZY_SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
const LAZY_BG_ATTRS = ['data-bg', 'data-background', 'data-background-image'];

/** Highest-width candidate in a srcset, or the last one if none carry widths. */
export function bestSrcsetUrl(srcset: string): string | null {
  const entries = srcset
    .trim()
    .split(/,(?=\s*(?:https?:|data:|blob:|\/|\.{1,2}\/|[\w-]+[./]))/i)
    .map((c) => c.trim())
    .filter(Boolean);
  if (!entries.length) return null;
  let best: { url: string; w: number } | null = null;
  for (const e of entries) {
    const parts = e.split(/\s+/);
    const url = parts[0];
    const wMatch = parts.slice(1).join(' ').match(/(\d+)w/);
    const w = wMatch ? parseInt(wMatch[1], 10) : 0;
    if (!best || w >= best.w) best = { url, w };
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
  const html = ns.textContent || '';
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
