import { classifyPage, pageDefaults, collectPageSignals } from '@/extension/shared/collection/pageType';
import { PageSignals } from '@/types';

const sig = (over: Partial<PageSignals>): PageSignals => ({
  imageCount: 0, density: 0, aspectSpread: 0, hasArticle: false, dominantAreaRatio: 0, feedMarkers: false, ...over,
});

describe('classifyPage', () => {
  it('classifies a uniform image-dense grid as gallery', () => {
    expect(classifyPage(sig({ imageCount: 40, density: 0.8, aspectSpread: 0.02 }))).toBe('gallery');
  });
  it('classifies a repeated-card scroll as feed', () => {
    expect(classifyPage(sig({ imageCount: 25, density: 0.3, aspectSpread: 0.5, feedMarkers: true }))).toBe('feed');
  });
  it('classifies an <article> page as article', () => {
    expect(classifyPage(sig({ imageCount: 6, hasArticle: true, aspectSpread: 0.4 }))).toBe('article');
  });
  it('classifies one dominant image as single-media', () => {
    expect(classifyPage(sig({ imageCount: 3, dominantAreaRatio: 0.9 }))).toBe('single-media');
  });
  it('falls back to unknown on weak signals', () => {
    expect(classifyPage(sig({ imageCount: 4, density: 0.1, aspectSpread: 0.4 }))).toBe('unknown');
  });
  it('classifies a uniform role="article" grid as gallery, not feed', () => {
    // grid tiles marked role=article (>=5) but uniform + dense → gallery must win
    expect(
      classifyPage(
        sig({ imageCount: 40, density: 0.8, aspectSpread: 0.02, hasArticle: false, dominantAreaRatio: 0.1, feedMarkers: true }),
      ),
    ).toBe('gallery');
  });
});

describe('pageDefaults', () => {
  it('gallery seeds a medium size floor and size-descending sort', () => {
    expect(pageDefaults('gallery')).toEqual({ sizeBucket: 'medium', sortBy: 'size', sortDir: 'desc' });
  });
  it('feed seeds a medium size floor', () => {
    expect(pageDefaults('feed')).toEqual({ sizeBucket: 'medium' });
  });
  it('article/single-media/unknown seed nothing (today\'s defaults)', () => {
    expect(pageDefaults('article')).toEqual({});
    expect(pageDefaults('single-media')).toEqual({});
    expect(pageDefaults('unknown')).toEqual({});
  });
});

describe('collectPageSignals', () => {
  it('reads image count and the <article> signal from the DOM', () => {
    document.body.innerHTML = '<article><img width="800" height="600"><img width="400" height="300"></article>';
    const s = collectPageSignals(document);
    expect(s.imageCount).toBe(2);
    expect(s.hasArticle).toBe(true);
  });
  it('reports no article when none is present', () => {
    document.body.innerHTML = '<div><img width="100" height="100"></div>';
    expect(collectPageSignals(document).hasArticle).toBe(false);
  });
  it('derives density, aspect spread, dominant ratio, and feed markers', () => {
    document.body.innerHTML =
      '<div role="feed">' +
      '<img width="400" height="300"><img width="800" height="600"><img width="1200" height="900">' +
      '</div>';
    const s = collectPageSignals(document);
    expect(s.imageCount).toBe(3);
    expect(s.feedMarkers).toBe(true);
    expect(s.dominantAreaRatio).toBeGreaterThan(0);
    expect(s.dominantAreaRatio).toBeLessThanOrEqual(1);
    expect(Number.isFinite(s.aspectSpread)).toBe(true);
  });
});
