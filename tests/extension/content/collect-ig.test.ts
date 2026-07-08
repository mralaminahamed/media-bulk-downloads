/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.instagram.com/p/ABC123/" }
 *
 * collectMedia() surfaces the whole post a single-post/reel page is showing from
 * the IG resolver's in-memory store (media the virtualized/blob:-backed DOM
 * hides), keyed by the shortcode in the page URL. That branch only runs on an
 * instagram.com POST url, and jsdom's `location` is immutable at runtime
 * (LegacyUnforgeable), so — like relay-ig.test.ts — the host+path is pinned per
 * file via `@vitest-environment-options`. Uses the REAL resolver (not mocked) so
 * the seeded entry round-trips through instagramPageMedia() into the collection.
 */
import { collectMedia } from '@/extension/content/collect';
import { ingestSniffedIgMedia, __resetIgResolver } from '@/extension/shared/resolvers/sites/instagram';

const HERO = 'https://scontent.cdninstagram.com/hero.jpg';
const REEL_MP4 = 'https://scontent.cdninstagram.com/reel.mp4';

describe('collectMedia — Instagram page media (single-post page)', () => {
  beforeEach(() => {
    __resetIgResolver();
    document.body.innerHTML = '';
  });

  afterAll(() => {
    __resetIgResolver();
  });

  it('surfaces the opened post\'s sniffed media (keyed by the URL shortcode) even when the DOM has none', () => {
    // The page URL is .../p/ABC123/ — seed the resolver store for that shortcode.
    ingestSniffedIgMedia([
      { code: 'ABC123', kind: 'image', url: HERO, ext: 'jpg', width: 1080, height: 1080 },
      { code: 'ABC123', kind: 'video', url: REEL_MP4, ext: 'mp4', poster: HERO },
      // A different post's media must NOT leak into this page's collection.
      { code: 'ZZZ999', kind: 'image', url: 'https://scontent.cdninstagram.com/other.jpg', ext: 'jpg' },
    ]);

    const srcs = collectMedia().map((m) => m.src);

    expect(srcs).toContain(HERO); // carousel image slide the DOM virtualized away
    expect(srcs).toContain(REEL_MP4); // the real mp4 behind a blob: reel <video>
    expect(srcs).not.toContain('https://scontent.cdninstagram.com/other.jpg'); // wrong shortcode
  });

  it('does not re-add a page-media URL already collected from the DOM (dedup by src)', () => {
    document.body.innerHTML = `<img src="${HERO}">`;
    ingestSniffedIgMedia([{ code: 'ABC123', kind: 'image', url: HERO, ext: 'jpg', width: 1080, height: 1080 }]);

    const hero = collectMedia().filter((m) => m.src === HERO);
    expect(hero).toHaveLength(1);
  });
});
