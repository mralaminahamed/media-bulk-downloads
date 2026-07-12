/**
 * Passive page-type prior. A few cheap, DOM-only signals classify a page as
 * gallery / feed / article / single-media (or unknown), used to prime filter
 * defaults and collection pass order. No network, no settings — pure functions.
 */
import { PageType, PageSignals, FilterOptions } from '@/types';

/** Cheap DOM signals for classification. Reads only synchronous layout-free props. */
export function collectPageSignals(doc: Document): PageSignals {
  const imgs = Array.from(doc.images);
  const imageCount = imgs.length;
  const areas = imgs.map((im) => (im.naturalWidth || im.width || 0) * (im.naturalHeight || im.height || 0));
  const totalArea = areas.reduce((a, b) => a + b, 0);
  const dominantAreaRatio = totalArea > 0 ? Math.max(0, ...areas) / totalArea : 0;

  const ratios = imgs
    .map((im) => {
      const w = im.naturalWidth || im.width || 0;
      const h = im.naturalHeight || im.height || 0;
      return h > 0 ? w / h : 0;
    })
    .filter((r) => r > 0);
  const mean = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  const aspectSpread = ratios.length
    ? ratios.reduce((a, r) => a + (r - mean) * (r - mean), 0) / ratios.length
    : 0;

  const viewport = Math.max(1, (doc.defaultView?.innerWidth || 1280) * (doc.defaultView?.innerHeight || 800));
  const density = (imageCount * 200 * 200) / viewport; // rough: assume ~200px tiles

  const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') || '';
  const hasArticle = !!doc.querySelector('article') || ogType.toLowerCase() === 'article';

  const feedMarkers = !!doc.querySelector('[role="feed"]') || doc.querySelectorAll('[role="article"]').length >= 5;

  return { imageCount, density, aspectSpread, hasArticle, dominantAreaRatio, feedMarkers };
}

/**
 * Classify from signals. Order matters: single-media (one dominant asset) and
 * feed (explicit markers) are checked before the density/uniformity gallery test;
 * article is the text-page fallback; everything else is unknown (→ today's defaults).
 */
export function classifyPage(s: PageSignals): PageType {
  if (s.imageCount <= 5 && s.dominantAreaRatio >= 0.75) return 'single-media';
  if (s.feedMarkers && s.imageCount >= 10) return 'feed';
  if (s.imageCount >= 20 && s.density >= 0.5 && s.aspectSpread < 0.1) return 'gallery';
  if (s.hasArticle) return 'article';
  return 'unknown';
}

/** Per-type filter-default seed (Partial merged over DEFAULT_FILTERS). Empty = today's defaults. */
export function pageDefaults(t: PageType): Partial<FilterOptions> {
  if (t === 'gallery') return { sizeBucket: 'medium', sortBy: 'size', sortDir: 'desc' };
  if (t === 'feed') return { sizeBucket: 'medium' };
  return {};
}
