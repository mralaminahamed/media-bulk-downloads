import {
  imageUrlsFromElement, bestSrcsetUrl, galleryLinkCandidate, noscriptImageCandidates,
} from '@/extension/shared/extract';

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
