/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://shop.example.com/products/cool-shoe" }
 *
 * collectMedia() surfaces a Shopify product's complete media set (every variant
 * image + product videos) from the resolver's in-memory store, keyed by the handle
 * in the page URL. The store is primed by the content-script fetch of
 * /products/<handle>.js (ensureShopifyProduct) BEFORE collectMedia runs; this test
 * seeds it directly via the real resolver (ingestShopifyProduct) so the media
 * round-trips through shopifyPageMedia() into the collection. jsdom's `location`
 * is immutable, so the product URL is pinned per file via environment-options.
 */
import { collectMedia } from '@/extension/content/collect';
import { ingestShopifyProduct, __resetShopify } from '@mbd/core/resolvers/sites/shopify';

const PAGE_HOST = 'shop.example.com';
const IMG = 'https://cdn.shopify.com/s/files/1/x/cool_2000x2000.jpg';
const MP4 = 'https://cdn.shopify.com/videos/c/o/v/hi.mp4';

const product = {
  media: [
    { id: 101, media_type: 'image', src: IMG, width: 2000, height: 2000 },
    {
      id: 103, media_type: 'video',
      preview_image: { src: 'https://cdn.shopify.com/s/files/1/x/poster.jpg' },
      sources: [{ format: 'mp4', mime_type: 'video/mp4', height: 1080, url: MP4 }],
    },
  ],
};

describe('collectMedia — Shopify product page media', () => {
  beforeEach(() => {
    __resetShopify();
    document.body.innerHTML = '';
  });
  afterAll(() => __resetShopify());

  it("surfaces the product's image + video (keyed by the handle) even when the DOM has none", () => {
    ingestShopifyProduct('cool-shoe', product, PAGE_HOST);
    ingestShopifyProduct('other', { media: [{ id: 1, media_type: 'image', src: 'https://cdn.shopify.com/s/files/other.jpg' }] }, PAGE_HOST);

    const srcs = collectMedia().map((m) => m.src);
    expect(srcs).toContain(IMG);
    expect(srcs).toContain(MP4);
    expect(srcs).not.toContain('https://cdn.shopify.com/s/files/other.jpg');
  });

  it('routes the product video as a plain mp4 video item with its poster', () => {
    ingestShopifyProduct('cool-shoe', product, PAGE_HOST);
    const vid = collectMedia().find((m) => m.src === MP4);
    expect(vid).toMatchObject({ kind: 'video', type: 'mp4', poster: 'https://cdn.shopify.com/s/files/1/x/poster.jpg' });
    expect(vid?.hlsManifest).toBeUndefined();
  });

  it('does not re-add a page-media image already collected from the DOM (dedup by src)', () => {
    ingestShopifyProduct('cool-shoe', product, PAGE_HOST);
    document.body.innerHTML = `<img src="${IMG}">`;
    expect(collectMedia().filter((m) => m.src === IMG)).toHaveLength(1);
  });
});
