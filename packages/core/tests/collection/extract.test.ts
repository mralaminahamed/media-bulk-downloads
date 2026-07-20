import {
  imageUrlsFromElement, bestSrcsetUrl, galleryLinkCandidate, noscriptImageCandidates,
} from '@mbd/core/collection/extract';

describe('bestSrcsetUrl', () => {
  it('picks the highest-width candidate', () => {
    expect(bestSrcsetUrl('a.jpg 320w, b.jpg 1024w, c.jpg 640w')).toBe('b.jpg');
  });
  it('prefers the densest candidate for a pure-density srcset, regardless of order', () => {
    expect(bestSrcsetUrl('hi.jpg 2x, lo.jpg 1x')).toBe('hi.jpg');
    expect(bestSrcsetUrl('lo.jpg 1x, hi.jpg 3x')).toBe('hi.jpg');
  });
  it('picks the density-carrying candidate over an undescribed one', () => {
    expect(bestSrcsetUrl('a.jpg, b.jpg 2x')).toBe('b.jpg');
  });
  it('returns null for an empty or whitespace-only srcset (no candidates to split)', () => {
    expect(bestSrcsetUrl('')).toBeNull();
    expect(bestSrcsetUrl('   ')).toBeNull();
  });
  it('does not let a malformed (NaN) descriptor lock out later higher-res candidates', () => {
    expect(bestSrcsetUrl('a.jpg 1.2.3x, b.jpg 5x')).toBe('b.jpg');
    expect(bestSrcsetUrl('a.jpg 1.2.3w, b.jpg 1024w')).toBe('b.jpg');
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

  it('reads data-url (WEBTOON panels keep the real URL there, src is a placeholder)', () => {
    const img = document.createElement('img');
    img.className = '_images';
    img.setAttribute('src', 'https://www.webtoons.com/.../bg_transparency.png');
    img.setAttribute('data-url', 'https://webtoon-phinf.pstatic.net/x/y/z.jpg?type=q90');
    expect(imageUrlsFromElement(img)).toContain('https://webtoon-phinf.pstatic.net/x/y/z.jpg?type=q90');
  });

  it('dedupes a URL that appears via two different lazy attributes', () => {
    const img = document.createElement('img');
    const same = 'https://cdn.com/same.jpg';
    img.setAttribute('data-orig-file', same);
    img.setAttribute('src', same);
    const urls = imageUrlsFromElement(img);
    expect(urls.filter((u) => u === same)).toHaveLength(1);
  });

  it('falls back to the src attribute on a non-<img> element with no currentSrc property', () => {
    const source = document.createElement('source');
    source.setAttribute('src', 'https://cdn.com/fallback.jpg');
    expect(imageUrlsFromElement(source)).toContain('https://cdn.com/fallback.jpg');
  });

  it('reads a plain srcset attribute and a data-lazy-srcset attribute', () => {
    const img = document.createElement('img');
    img.setAttribute('srcset', 'plain-320.jpg 320w, plain-900.jpg 900w');
    expect(imageUrlsFromElement(img)).toEqual(
      expect.arrayContaining(['plain-900.jpg', 'plain-320.jpg']),
    );

    const lazy = document.createElement('img');
    lazy.setAttribute('data-lazy-srcset', 'lazy-320.jpg 320w, lazy-900.jpg 900w');
    expect(imageUrlsFromElement(lazy)).toEqual(
      expect.arrayContaining(['lazy-900.jpg', 'lazy-320.jpg']),
    );
  });

  it('a real <picture> with two <source>s and a fallback <img> yields correct per-element candidates', () => {
    const picture = document.createElement('picture');
    picture.innerHTML = `
      <source type="image/avif" srcset="hero-avif-480.avif 480w, hero-avif-1200.avif 1200w">
      <source type="image/webp" srcset="hero-webp-480.webp 480w, hero-webp-1200.webp 1200w">
      <img src="https://cdn.com/hero-fallback.jpg" data-src="https://cdn.com/hero-lazy.jpg">
    `;
    const [avifSource, webpSource, img] = Array.from(picture.children) as [HTMLSourceElement, HTMLSourceElement, HTMLImageElement];
    expect(imageUrlsFromElement(avifSource)).toEqual(['hero-avif-1200.avif', 'hero-avif-480.avif']);
    expect(imageUrlsFromElement(webpSource)).toEqual(['hero-webp-1200.webp', 'hero-webp-480.webp']);
    expect(imageUrlsFromElement(img)).toEqual(['https://cdn.com/hero-lazy.jpg', 'https://cdn.com/hero-fallback.jpg']);
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
  it('extracts an unquoted url(...) value', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'url(https://cdn.com/no-quotes.jpg)');
    expect(imageUrlsFromElement(el)).toContain('https://cdn.com/no-quotes.jpg');
  });
  it('reads the data-background-image attribute', () => {
    const el = document.createElement('div');
    el.setAttribute('data-background-image', "url('https://cdn.com/bg-image-attr.jpg')");
    expect(imageUrlsFromElement(el)).toContain('https://cdn.com/bg-image-attr.jpg');
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
    const a = document.createElement('a');
    a.setAttribute('href', 'http://[');
    expect(galleryLinkCandidate(a)).toBeNull();
  });
  it('returns null when there is no href attribute at all', () => {
    const a = document.createElement('a');
    a.appendChild(document.createElement('img'));
    expect(galleryLinkCandidate(a)).toBeNull();
  });
  it('omits thumbnailSrc when the anchor has no inner <img>', () => {
    const a = document.createElement('a');
    a.href = 'https://cdn.com/full-no-thumb.jpg';
    const result = galleryLinkCandidate(a);
    expect(result).toEqual({ url: 'https://cdn.com/full-no-thumb.jpg' });
    expect(result).not.toHaveProperty('thumbnailSrc');
  });
  it('omits thumbnailSrc when the inner <img> carries no src/currentSrc', () => {
    const a = document.createElement('a');
    a.href = 'https://cdn.com/full-empty-img.jpg';
    a.appendChild(document.createElement('img'));
    const result = galleryLinkCandidate(a);
    expect(result).toEqual({ url: 'https://cdn.com/full-empty-img.jpg' });
    expect(result).not.toHaveProperty('thumbnailSrc');
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

  it('returns [] for an empty noscript block (falsy textContent)', () => {
    const ns = document.createElement('noscript');
    expect(noscriptImageCandidates(ns)).toEqual([]);
  });

  it('unescapes singly-escaped entities before scanning for <img> markup', () => {
    const ns = document.createElement('noscript');
    ns.textContent = '&lt;img src=&quot;https://cdn.com/escaped.jpg&quot; alt=&#39;x&#39;&gt;';
    expect(noscriptImageCandidates(ns)).toEqual([{ url: 'https://cdn.com/escaped.jpg' }]);
  });

  it('returns [] when escaped text decodes to something with no <img> markup', () => {
    const ns = document.createElement('noscript');
    ns.textContent = 'price &lt; $5 and nothing else';
    expect(noscriptImageCandidates(ns)).toEqual([]);
  });

  it('extracts from multiple <img>s, skipping a missing src and a blank srcset', () => {
    const ns = document.createElement('noscript');
    ns.textContent =
      '<img src="https://cdn.com/one.jpg">' +
      '<img srcset="   ">' +
      '<img srcset="https://cdn.com/two-lo.jpg 320w, https://cdn.com/two-hi.jpg 900w">';
    expect(noscriptImageCandidates(ns)).toEqual([
      { url: 'https://cdn.com/one.jpg' },
      { url: 'https://cdn.com/two-hi.jpg' },
    ]);
  });

  it('returns [] (not a crash) when the HTML parser throws', () => {
    const ns = document.createElement('noscript');
    ns.textContent = '<img src="https://cdn.com/x.jpg">';
    const RealDOMParser = global.DOMParser;
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
