import {
  imageUrlsFromElement, bestSrcsetUrl, galleryLinkCandidate, noscriptImageCandidates,
} from '@mbd/core/collection/extract';

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
  it('returns null for an empty or whitespace-only srcset (no candidates to split)', () => {
    expect(bestSrcsetUrl('')).toBeNull();
    expect(bestSrcsetUrl('   ')).toBeNull();
  });
  it('does not let a malformed (NaN) descriptor lock out later higher-res candidates', () => {
    // `1.2.3x` -> NaN; if it poisoned best.x, no later `x > best.x` could ever win.
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

  it('dedupes a URL that appears via two different lazy attributes', () => {
    // data-orig-file and src happen to carry the identical URL — the `push`
    // helper's `!out.includes(u)` guard must keep it in the list exactly once,
    // not twice, so downstream candidate ranking isn't skewed by a duplicate.
    const img = document.createElement('img');
    const same = 'https://cdn.com/same.jpg';
    img.setAttribute('data-orig-file', same);
    img.setAttribute('src', same);
    const urls = imageUrlsFromElement(img);
    expect(urls.filter((u) => u === same)).toHaveLength(1);
  });

  it('falls back to the src attribute on a non-<img> element with no currentSrc property', () => {
    // <source> (as inside <picture>) has no `currentSrc`, so the cast yields
    // `undefined` and the code must fall back to the plain `src` attribute.
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
    // Complex, realistic DOM: each element is extracted independently (the
    // module never walks siblings/parents), so a nested picture only ever
    // contributes whichever element the caller hands to imageUrlsFromElement.
    const picture = document.createElement('picture');
    picture.innerHTML = `
      <source type="image/avif" srcset="hero-avif-480.avif 480w, hero-avif-1200.avif 1200w">
      <source type="image/webp" srcset="hero-webp-480.webp 480w, hero-webp-1200.webp 1200w">
      <img src="https://cdn.com/hero-fallback.jpg" data-src="https://cdn.com/hero-lazy.jpg">
    `;
    const [avifSource, webpSource, img] = Array.from(picture.children) as [HTMLSourceElement, HTMLSourceElement, HTMLImageElement];
    expect(imageUrlsFromElement(avifSource)).toEqual(['hero-avif-1200.avif', 'hero-avif-480.avif']);
    expect(imageUrlsFromElement(webpSource)).toEqual(['hero-webp-1200.webp', 'hero-webp-480.webp']);
    // data-src (lazy attr) is ordered ahead of the resized src, same as the WP case.
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
    // An unclosed IPv6 authority (`http://[`) is unparseable by the URL
    // constructor with or without a base, so the guard returns null rather than
    // throwing out of the collector.
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
    a.appendChild(document.createElement('img')); // no src attribute set
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
    // Simulates a scripting-enabled parse of <noscript>, where textContent
    // returns the source un-decoded (see the function's doc comment).
    const ns = document.createElement('noscript');
    ns.textContent = '&lt;img src=&quot;https://cdn.com/escaped.jpg&quot; alt=&#39;x&#39;&gt;';
    expect(noscriptImageCandidates(ns)).toEqual([{ url: 'https://cdn.com/escaped.jpg' }]);
  });

  it('returns [] when escaped text decodes to something with no <img> markup', () => {
    // Contains `&lt;` (triggers the unescape attempt) but decodes to plain text,
    // not an <img> tag — must still fall through to the no-markup empty result.
    const ns = document.createElement('noscript');
    ns.textContent = 'price &lt; $5 and nothing else';
    expect(noscriptImageCandidates(ns)).toEqual([]);
  });

  it('extracts from multiple <img>s, skipping a missing src and a blank srcset', () => {
    const ns = document.createElement('noscript');
    ns.textContent =
      '<img src="https://cdn.com/one.jpg">' +
      '<img srcset="   ">' + // whitespace-only srcset -> bestSrcsetUrl returns null, nothing pushed
      '<img srcset="https://cdn.com/two-lo.jpg 320w, https://cdn.com/two-hi.jpg 900w">'; // no src attr at all
    expect(noscriptImageCandidates(ns)).toEqual([
      { url: 'https://cdn.com/one.jpg' },
      { url: 'https://cdn.com/two-hi.jpg' },
    ]);
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
