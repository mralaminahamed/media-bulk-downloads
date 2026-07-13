/**
 * Passive page-type prior. A few cheap, DOM-only signals classify a page as
 * gallery / feed / article / single-media (or unknown), used to prime filter
 * defaults and collection pass order. No network, no settings — pure functions.
 */
import { PageType, PageSignals, FilterOptions } from '@mbd/core/types';

/**
 * Cheap DOM signals for classification. Reads only synchronous, layout-free
 * props: `naturalWidth`/`naturalHeight` (already resolved once the image
 * decodes) and the `width`/`height` content attributes (via `getAttribute`).
 * Deliberately avoids the `.width`/`.height` IDL getters, which force a
 * layout pass when `naturalWidth` is 0 (lazy/unsized images).
 */
export function collectPageSignals(doc: Document): PageSignals {
  const imgs = Array.from(doc.images);
  const imageCount = imgs.length;
  const dims = imgs.map((im) => ({
    w: im.naturalWidth || Number(im.getAttribute('width')) || 0,
    h: im.naturalHeight || Number(im.getAttribute('height')) || 0,
  }));
  const areas = dims.map(({ w, h }) => w * h);
  const totalArea = areas.reduce((a, b) => a + b, 0);
  const maxArea = areas.reduce((m, a) => (a > m ? a : m), 0);
  const dominantAreaRatio = totalArea > 0 ? maxArea / totalArea : 0;

  const ratios = dims
    .map(({ w, h }) => (h > 0 ? w / h : 0))
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
 * Classify from signals. Order matters: single-media (one dominant asset) is
 * checked first, then the density/uniformity gallery test — a dense, uniform
 * grid of tiles wins as `gallery` even when tiles happen to carry a legit
 * non-feed ARIA pattern like `role="article"` — then feed (explicit markers);
 * article is the text-page fallback; everything else is unknown (→ today's
 * defaults).
 */
export function classifyPage(s: PageSignals): PageType {
  if (s.imageCount <= 5 && s.dominantAreaRatio >= 0.75) return 'single-media';
  if (s.imageCount >= 20 && s.density >= 0.5 && s.aspectSpread < 0.1) return 'gallery';
  if (s.feedMarkers && s.imageCount >= 10) return 'feed';
  if (s.hasArticle) return 'article';
  return 'unknown';
}

/** Per-type filter-default seed (Partial merged over DEFAULT_FILTERS). Empty = today's defaults. */
export function pageDefaults(t: PageType): Partial<FilterOptions> {
  if (t === 'gallery') return { sizeBucket: 'medium', sortBy: 'size', sortDir: 'desc' };
  if (t === 'feed') return { sizeBucket: 'medium' };
  return {};
}
