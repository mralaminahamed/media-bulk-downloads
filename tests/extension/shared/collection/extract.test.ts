import {
  imageUrlsFromElement, bestSrcsetUrl, galleryLinkCandidate, noscriptImageCandidates,
} from '@/extension/shared/collection/extract';

describe('bestSrcsetUrl', () => {
  it('picks the highest-width candidate', () => {
    expect(bestSrcsetUrl('a.jpg 320w, b.jpg 1024w, c.jpg 640w')).toBe('b.jpg');
  });
  it('falls back to the last candidate without widths', () => {
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
});

describe('noscriptImageCandidates', () => {
  it('extracts img src from noscript markup', () => {
    const ns = document.createElement('noscript');
    ns.textContent = '<img src="https://cdn.com/real.png" alt="x">';
    expect(noscriptImageCandidates(ns)).toEqual([{ url: 'https://cdn.com/real.png' }]);
  });
});
