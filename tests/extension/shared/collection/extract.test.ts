import {
  imageUrlsFromElement, bestSrcsetUrl, galleryLinkCandidate, noscriptImageCandidates,
} from '@/extension/shared/collection/extract';

describe('bestSrcsetUrl', () => {
  it('picks the highest-width candidate', () => {
    expect(bestSrcsetUrl('a.jpg 320w, b.jpg 1024w, c.jpg 640w')).toBe('b.jpg');
  });
  it('prefers the densest candidate for a pure-density srcset, regardless of order', () => {
    // Descending density: the densest is FIRST, so a naive "last wins" would pick lo.jpg.
    expect(bestSrcsetUrl('hi.jpg 2x, lo.jpg 1x')).toBe('hi.jpg');
    expect(bestSrcsetUrl('lo.jpg 1x, hi.jpg 3x')).toBe('hi.jpg');
  });
  it('picks the density-carrying candidate over an undescribed one', () => {
    expect(bestSrcsetUrl('a.jpg, b.jpg 2x')).toBe('b.jpg');
  });
});

describe('imageUrlsFromElement', () => {
  it('reads lazy data-src and srcset best', () => {
    const img = document.createElement('img');
    img.setAttribute('data-src', 'real.jpg');
    img.setAttribute('data-srcset', 't-320.jpg 320w, t-1200.jpg 1200w');
    const urls = imageUrlsFromElement(img);
    expect(urls).toContain('real.jpg');
    expect(urls).toContain('t-1200.jpg');
  });

  it('prefers WP data-orig-file over the resized src as the primary candidate', () => {
    const img = document.createElement('img');
    img.setAttribute('src', 'https://cdn.com/img-300x200.jpg');
    img.setAttribute('data-orig-file', 'https://cdn.com/img.jpg');
    const urls = imageUrlsFromElement(img);
    // index 0 is the primary (carries the element's DOM dims in collect.ts).
    expect(urls[0]).toBe('https://cdn.com/img.jpg');
    expect(urls).toContain('https://cdn.com/img-300x200.jpg');
  });

  it('reads data-large-file and the extended lazy-attr set', () => {
    const img = document.createElement('img');
    img.setAttribute('data-large-file', 'https://cdn.com/large.jpg');
    img.setAttribute('data-actualsrc', 'https://cdn.com/actual.jpg');
    img.setAttribute('data-echo', 'https://cdn.com/echo.jpg');
    const urls = imageUrlsFromElement(img);
    expect(urls).toEqual(
      expect.arrayContaining(['https://cdn.com/large.jpg', 'https://cdn.com/actual.jpg', 'https://cdn.com/echo.jpg']),
    );
  });
});

describe('imageUrlsFromElement — CSS background lazy attrs', () => {
  it('extracts the URL from a data-bg url(...) wrapper', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', "url('https://cdn.com/bg.jpg')");
    expect(imageUrlsFromElement(el)).toContain('https://cdn.com/bg.jpg');
  });
  it('uses a bare data-background value that is not wrapped in url()', () => {
    const el = document.createElement('div');
    el.setAttribute('data-background', 'https://cdn.com/plain-bg.png');
    expect(imageUrlsFromElement(el)).toContain('https://cdn.com/plain-bg.png');
  });
});

describe('galleryLinkCandidate', () => {
  it('returns full-res href with the inner img as thumbnail', () => {
    const a = document.createElement('a');
    a.href = 'https://cdn.com/full.jpg';
    const img = document.createElement('img');
    img.src = 'https://cdn.com/thumb.jpg';
    a.appendChild(img);
    expect(galleryLinkCandidate(a)).toEqual({ url: 'https://cdn.com/full.jpg', thumbnailSrc: 'https://cdn.com/thumb.jpg' });
  });
  it('ignores anchors whose href is a page', () => {
    const a = document.createElement('a');
    a.href = 'https://site.com/article/hello';
    a.appendChild(document.createElement('img'));
    expect(galleryLinkCandidate(a)).toBeNull();
  });
  it('returns null when the href cannot be parsed even against the base URI', () => {
    // An unclosed IPv6 authority (`http://[`) is unparseable by the URL
    // constructor with or without a base, so the guard returns null rather than
    // throwing out of the collector.
    const a = document.createElement('a');
    a.setAttribute('href', 'http://[');
    expect(galleryLinkCandidate(a)).toBeNull();
  });
});

describe('noscriptImageCandidates', () => {
  it('extracts img src from noscript markup', () => {
    const ns = document.createElement('noscript');
    ns.textContent = '<img src="https://cdn.com/real.png" alt="x">';
    expect(noscriptImageCandidates(ns)).toEqual([{ url: 'https://cdn.com/real.png' }]);
  });

  it('also extracts the best srcset candidate from a noscript <img srcset>', () => {
    const ns = document.createElement('noscript');
    ns.textContent =
      '<img src="https://cdn.com/lo.jpg" srcset="https://cdn.com/a-320.jpg 320w, https://cdn.com/a-1200.jpg 1200w">';
    expect(noscriptImageCandidates(ns)).toEqual([
      { url: 'https://cdn.com/lo.jpg' },
      { url: 'https://cdn.com/a-1200.jpg' },
    ]);
  });

  it('returns [] when there is no <img> markup', () => {
    const ns = document.createElement('noscript');
    ns.textContent = 'just some plain text, no image here';
    expect(noscriptImageCandidates(ns)).toEqual([]);
  });

  it('returns [] (not a crash) when the HTML parser throws', () => {
    const ns = document.createElement('noscript');
    ns.textContent = '<img src="https://cdn.com/x.jpg">';
    const RealDOMParser = global.DOMParser;
    // Force the defensive catch: a parser that throws must yield [] gracefully.
    (global as unknown as { DOMParser: unknown }).DOMParser = class {
      parseFromString(): Document {
        throw new Error('parse boom');
      }
    };
    try {
      expect(noscriptImageCandidates(ns)).toEqual([]);
    } finally {
      global.DOMParser = RealDOMParser;
    }
  });
});
