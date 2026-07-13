/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.pinterest.com/pin/698058011039781102/" }
 *
 * collectMedia() surfaces the opened pin's sniffed media from the Pinterest
 * resolver's in-memory store (media the virtualized/unhydrated grid hides),
 * keyed by the pin id in the page URL. That branch only runs on a
 * pinterest.com /pin/<id>/ URL, and jsdom's `location` is immutable at
 * runtime (LegacyUnforgeable), so — like collect-ig.test.ts / collect-fb.test.ts —
 * the host+path is pinned per file via `@vitest-environment-options`. Uses the
 * REAL resolver (not mocked) so the seeded entry round-trips through
 * pinterestPageMedia() into the collection.
 */
import { collectMedia } from '@/extension/content/collect';
import { ingestSniffedPinterestMedia, __resetPinterestSniffed } from '@/extension/shared/resolvers/sites/pinterest';

const ORIGINAL = 'https://i.pinimg.com/originals/aa/bb/cc.jpg';

describe('collectMedia — Pinterest page media (opened pin page)', () => {
  beforeEach(() => {
    __resetPinterestSniffed();
    document.body.innerHTML = '';
  });

  afterAll(() => {
    __resetPinterestSniffed();
  });

  it("surfaces the opened pin's sniffed ORIGINAL (keyed by the pin id in the URL) even when the DOM has none", () => {
    // The page URL is .../pin/698058011039781102/ — seed the resolver store
    // for that pin id. The DOM is left empty: a virtualized/unhydrated grid
    // means there is nothing here for the per-element resolve() walk to latch
    // onto, so the ORIGINAL can only reach the collection via pinterestPageMedia().
    ingestSniffedPinterestMedia([
      { pinId: '698058011039781102', kind: 'image', url: ORIGINAL, ext: 'jpg', width: 1000, height: 1500 },
      // A different pin's media must NOT leak into this page's collection.
      { pinId: '111111111111111111', kind: 'image', url: 'https://i.pinimg.com/originals/dd/ee/ff.jpg', ext: 'jpg' },
    ]);

    const srcs = collectMedia().map((m) => m.src);

    expect(srcs).toContain(ORIGINAL); // sniffed orig the DOM walk never touched
    expect(srcs).not.toContain('https://i.pinimg.com/originals/dd/ee/ff.jpg'); // wrong pin id
  });

  it('does not re-add a page-media URL already collected from the DOM (dedup by src)', () => {
    ingestSniffedPinterestMedia([{ pinId: '698058011039781102', kind: 'image', url: ORIGINAL, ext: 'jpg', width: 1000, height: 1500 }]);
    document.body.innerHTML = `<img src="${ORIGINAL}">`;

    const orig = collectMedia().filter((m) => m.src === ORIGINAL);
    expect(orig).toHaveLength(1);
  });
});
