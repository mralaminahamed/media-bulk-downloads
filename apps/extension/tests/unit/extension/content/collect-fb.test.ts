/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/photo/?fbid=100" }
 *
 * collectMedia() surfaces the opened photo/video's full-res original / real mp4
 * from the FB resolver's in-memory store (media the DOM hides — viewer blob:,
 * virtualized album), keyed by the fbid in the page URL. That branch only runs
 * on a facebook.com photo/video/watch/reel URL, and jsdom's `location` is
 * immutable at runtime (LegacyUnforgeable), so — like relay-fb.test.ts /
 * facebook.test.ts — the host+path is pinned per file via
 * `@vitest-environment-options`. Uses the REAL resolver (not mocked) so the
 * seeded entry round-trips through facebookPageMedia() into the collection.
 */
import { collectMedia } from '@/extension/content/collect';
import { ingestSniffedFbMedia, __resetFbResolver } from '@mbd/core/resolvers/sites/facebook';

const THUMB = 'https://x.fbcdn.net/thumb_n.jpg';
const ORIGINAL = 'https://x.fbcdn.net/orig_n.jpg';

describe('collectMedia — Facebook page media (opened photo/video page)', () => {
  beforeEach(() => {
    __resetFbResolver();
    document.body.innerHTML = '';
  });

  afterAll(() => {
    __resetFbResolver();
  });

  it("surfaces the opened photo's sniffed ORIGINAL (keyed by the fbid in the URL) even when the DOM has none", () => {
    ingestSniffedFbMedia([
      { fbid: '100', kind: 'image', url: ORIGINAL, ext: 'jpg', width: 2048, height: 1536 },
      { fbid: '999', kind: 'image', url: 'https://x.fbcdn.net/other_n.jpg', ext: 'jpg' },
    ]);

    const srcs = collectMedia().map((m) => m.src);

    expect(srcs).toContain(ORIGINAL);
    expect(srcs).not.toContain(THUMB);
    expect(srcs).not.toContain('https://x.fbcdn.net/other_n.jpg');
  });

  it('does not re-add a page-media URL already collected from the DOM (dedup by src)', () => {
    ingestSniffedFbMedia([{ fbid: '100', kind: 'image', url: ORIGINAL, ext: 'jpg', width: 2048, height: 1536 }]);
    document.body.innerHTML = `<img src="${ORIGINAL}">`;

    const orig = collectMedia().filter((m) => m.src === ORIGINAL);
    expect(orig).toHaveLength(1);
  });
});
