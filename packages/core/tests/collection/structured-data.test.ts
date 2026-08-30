/** @vitest-environment jsdom */
import { structuredDataMedia } from '@mbd/core/collection/structured-data';

const ld = (obj: unknown): void => {
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(obj);
  document.head.appendChild(s);
};

beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; });

describe('structuredDataMedia — JSON-LD', () => {
  it('reads an ImageObject contentUrl with its dimensions', () => {
    ld({ '@context': 'https://schema.org', '@type': 'ImageObject', contentUrl: 'https://cdn.ex/full.jpg', width: 4000, height: 3000 });
    expect(structuredDataMedia(document)).toEqual([
      { url: 'https://cdn.ex/full.jpg', kind: 'image', width: 4000, height: 3000 },
    ]);
  });

  it('prefers contentUrl over url on the same node', () => {
    ld({ '@type': 'ImageObject', url: 'https://cdn.ex/page', contentUrl: 'https://cdn.ex/full.jpg' });
    expect(structuredDataMedia(document).map((m) => m.url)).toEqual(['https://cdn.ex/full.jpg']);
  });

  it('reads a VideoObject contentUrl and keeps thumbnailUrl as the poster', () => {
    ld({ '@type': 'VideoObject', contentUrl: 'https://cdn.ex/clip.mp4', thumbnailUrl: 'https://cdn.ex/poster.jpg' });
    expect(structuredDataMedia(document)).toEqual([
      { url: 'https://cdn.ex/clip.mp4', kind: 'video', poster: 'https://cdn.ex/poster.jpg' },
    ]);
  });

  it('walks @graph and nested arrays', () => {
    ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'NewsArticle', image: ['https://cdn.ex/a.jpg', { '@type': 'ImageObject', contentUrl: 'https://cdn.ex/b.jpg' }] },
        { '@type': 'VideoObject', contentUrl: 'https://cdn.ex/c.mp4' },
      ],
    });
    expect(structuredDataMedia(document).map((m) => m.url)).toEqual([
      'https://cdn.ex/a.jpg', 'https://cdn.ex/b.jpg', 'https://cdn.ex/c.mp4',
    ]);
  });

  it('reads an array of top-level nodes and several script blocks', () => {
    ld([{ '@type': 'ImageObject', contentUrl: 'https://cdn.ex/1.jpg' }]);
    ld({ '@type': 'ImageObject', contentUrl: 'https://cdn.ex/2.jpg' });
    expect(structuredDataMedia(document).map((m) => m.url)).toEqual(['https://cdn.ex/1.jpg', 'https://cdn.ex/2.jpg']);
  });

  it('parses string and QuantitativeValue dimensions, and drops nonsense ones', () => {
    ld({ '@type': 'ImageObject', contentUrl: 'https://cdn.ex/a.jpg', width: '1200', height: { '@type': 'QuantitativeValue', value: 800 } });
    ld({ '@type': 'ImageObject', contentUrl: 'https://cdn.ex/b.jpg', width: 'wide', height: -5 });
    const [a, b] = structuredDataMedia(document);
    expect(a).toMatchObject({ width: 1200, height: 800 });
    expect(b.width).toBeUndefined();
    expect(b.height).toBeUndefined();
  });

  it('dedupes a URL repeated across nodes', () => {
    ld({ '@graph': [
      { '@type': 'ImageObject', contentUrl: 'https://cdn.ex/same.jpg' },
      { '@type': 'NewsArticle', image: 'https://cdn.ex/same.jpg' },
    ] });
    expect(structuredDataMedia(document)).toHaveLength(1);
  });
});

describe('structuredDataMedia — untrusted input', () => {
  it('survives malformed JSON without throwing', () => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = '{ not json';
    document.head.appendChild(s);
    expect(structuredDataMedia(document)).toEqual([]);
  });

  it('rejects non-http(s) schemes', () => {
    ld({ '@graph': [
      { '@type': 'ImageObject', contentUrl: 'javascript:alert(1)' },
      { '@type': 'ImageObject', contentUrl: 'data:image/png;base64,AAA' },
      { '@type': 'ImageObject', contentUrl: 'file:///etc/passwd' },
      { '@type': 'ImageObject', contentUrl: 'https://cdn.ex/ok.jpg' },
    ] });
    expect(structuredDataMedia(document).map((m) => m.url)).toEqual(['https://cdn.ex/ok.jpg']);
  });

  it('does not recurse forever on a self-referencing structure', () => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    // A deeply nested blob, well past the depth cap.
    let deep: Record<string, unknown> = { '@type': 'ImageObject', contentUrl: 'https://cdn.ex/deep.jpg' };
    for (let i = 0; i < 200; i++) deep = { nested: deep };
    s.textContent = JSON.stringify(deep);
    document.head.appendChild(s);
    expect(() => structuredDataMedia(document)).not.toThrow();
  });

  it('caps the number of items a hostile page can inject', () => {
    ld({ '@graph': Array.from({ length: 5000 }, (_, i) => ({ '@type': 'ImageObject', contentUrl: `https://cdn.ex/${i}.jpg` })) });
    expect(structuredDataMedia(document).length).toBeLessThanOrEqual(200);
  });
});

describe('structuredDataMedia — microdata', () => {
  it('reads itemprop contentUrl from href/src/content', () => {
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/ImageObject">
        <link itemprop="contentUrl" href="https://cdn.ex/link.jpg">
        <img itemprop="contentUrl" src="https://cdn.ex/img.jpg">
        <meta itemprop="contentUrl" content="https://cdn.ex/meta.jpg">
      </div>`;
    expect(structuredDataMedia(document).map((m) => m.url)).toEqual([
      'https://cdn.ex/link.jpg', 'https://cdn.ex/img.jpg', 'https://cdn.ex/meta.jpg',
    ]);
  });

  it('classifies a VideoObject itemprop as video', () => {
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/VideoObject">
        <meta itemprop="contentUrl" content="https://cdn.ex/clip.mp4">
      </div>`;
    expect(structuredDataMedia(document)[0]).toMatchObject({ url: 'https://cdn.ex/clip.mp4', kind: 'video' });
  });
});
