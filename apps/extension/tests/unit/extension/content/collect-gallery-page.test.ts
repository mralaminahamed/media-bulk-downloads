/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://booru.example/index" }
 *
 * #287: collectMedia() emits a PENDING gallery-page item for an <a> that wraps a
 * thumbnail <img> and points at a SAME-ORIGIN host/"view" page — for the opt-in
 * resolve pass to follow to the real original. Gated on resolveOriginals; capped;
 * same-origin only; never for direct-media hrefs (those are collected in place).
 */
import { collectMedia } from '@/extension/content/collect';

const galleryItems = (items: ReturnType<typeof collectMedia>) =>
  items.filter((m) => m.resolveHint?.platform === 'gallery-page');

describe('collectMedia — gallery-page link following (#287)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('emits a pending gallery-page item for a same-origin view page wrapping a thumb (opt-in)', () => {
    document.body.innerHTML = `<a href="/post/123"><img src="https://cdn.booru.example/thumb/123.jpg" alt="cat"></a>`;
    const g = galleryItems(collectMedia(undefined, { resolveOriginals: true }));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      src: 'https://booru.example/post/123',
      kind: 'image',
      unresolvedImage: true,
      alt: 'cat',
      thumbnailSrc: 'https://cdn.booru.example/thumb/123.jpg',
      resolveHint: { platform: 'gallery-page', id: 'https://booru.example/post/123' },
    });
  });

  it('emits nothing when resolveOriginals is off (default — no behaviour change)', () => {
    document.body.innerHTML = `<a href="/post/123"><img src="https://cdn.booru.example/thumb/123.jpg"></a>`;
    expect(galleryItems(collectMedia())).toHaveLength(0);
    expect(galleryItems(collectMedia(undefined, { resolveOriginals: false }))).toHaveLength(0);
  });

  it('never follows a cross-origin link', () => {
    document.body.innerHTML = `<a href="https://other.example/post/9"><img src="https://cdn.booru.example/thumb/9.jpg"></a>`;
    expect(galleryItems(collectMedia(undefined, { resolveOriginals: true }))).toHaveLength(0);
  });

  it('does not fire for a direct-image href (handled in place by galleryLinkCandidate)', () => {
    document.body.innerHTML = `<a href="https://booru.example/full/5.jpg"><img src="https://cdn.booru.example/thumb/5.jpg"></a>`;
    const items = collectMedia(undefined, { resolveOriginals: true });
    expect(galleryItems(items)).toHaveLength(0);
    // …but the full image IS collected directly.
    expect(items.some((m) => m.src === 'https://booru.example/full/5.jpg')).toBe(true);
  });

  it('ignores a bare text link with no thumbnail img', () => {
    document.body.innerHTML = `<a href="/post/7">view post</a>`;
    expect(galleryItems(collectMedia(undefined, { resolveOriginals: true }))).toHaveLength(0);
  });

  it('caps the number of gallery pages queued per scan', () => {
    document.body.innerHTML = Array.from({ length: 75 }, (_, i) =>
      `<a href="/post/${i}"><img src="https://cdn.booru.example/thumb/${i}.jpg"></a>`).join('');
    expect(galleryItems(collectMedia(undefined, { resolveOriginals: true }))).toHaveLength(60);
  });
});
