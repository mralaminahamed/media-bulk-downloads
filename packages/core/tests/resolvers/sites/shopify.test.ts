import { beforeEach } from 'vitest';
import {
  extractShopifyMedia, shopifyProductHandle, ingestShopifyProduct, shopifyPageMedia, __resetShopify,
} from '@mbd/core/resolvers/sites/shopify';

const PAGE_HOST = 'shop.example.com';

const product = {
  handle: 'cool-shoe',
  media: [
    { id: 101, media_type: 'image', src: '//cdn.shopify.com/s/files/1/x/cool_2000x2000.jpg', width: 2000, height: 2000 },
    { id: 102, media_type: 'image', src: 'https://shop.example.com/cdn/shop/products/side.jpg', width: 1600, height: 1600 },
    {
      id: 103, media_type: 'video',
      preview_image: { src: '//cdn.shopify.com/s/files/1/x/poster.jpg', width: 1280, height: 720 },
      sources: [
        { format: 'mp4', mime_type: 'video/mp4', width: 854, height: 480, url: 'https://cdn.shopify.com/videos/c/o/v/lo.mp4' },
        { format: 'mp4', mime_type: 'video/mp4', width: 1920, height: 1080, url: 'https://cdn.shopify.com/videos/c/o/v/hi.mp4' },
        { format: 'm3u8', mime_type: 'application/x-mpegURL', url: 'https://cdn.shopify.com/videos/c/o/v/hls.m3u8' },
      ],
    },
    { id: 104, media_type: 'external_video', external_id: 'abc', host: 'youtube' },
    { id: 105, media_type: 'model' },
  ],
};

describe('extractShopifyMedia', () => {
  it('maps images (CDN + same-origin) to image candidates with dims + a stable mediaKey', () => {
    const c = extractShopifyMedia(product, PAGE_HOST);
    expect(c[0]).toMatchObject({ url: 'https://cdn.shopify.com/s/files/1/x/cool_2000x2000.jpg', kind: 'image', width: 2000, height: 2000, mediaKey: 'shopify:101' });
    expect(c[1]).toMatchObject({ url: 'https://shop.example.com/cdn/shop/products/side.jpg', kind: 'image', mediaKey: 'shopify:102' });
  });

  it('picks the highest-resolution mp4 for a video, keeps the poster, skips external_video/model', () => {
    const vid = extractShopifyMedia(product, PAGE_HOST).find((m) => m.kind === 'video');
    expect(vid).toMatchObject({
      url: 'https://cdn.shopify.com/videos/c/o/v/hi.mp4', kind: 'video', ext: 'mp4',
      poster: 'https://cdn.shopify.com/s/files/1/x/poster.jpg', width: 1920, height: 1080, mediaKey: 'shopify:103',
    });
    expect(extractShopifyMedia(product, PAGE_HOST)).toHaveLength(3);
  });

  it('falls back to the HLS master when a video has no progressive mp4', () => {
    const hlsOnly = { media: [{ id: 9, media_type: 'video', sources: [{ format: 'm3u8', url: 'https://cdn.shopify.com/videos/x/hls.m3u8' }] }] };
    expect(extractShopifyMedia(hlsOnly, PAGE_HOST)[0]).toMatchObject({ url: 'https://cdn.shopify.com/videos/x/hls.m3u8', kind: 'video', ext: 'm3u8' });
  });

  it('rejects untrusted URLs — off-CDN host, non-https, and a non-array media', () => {
    const evil = { media: [
      { id: 1, media_type: 'image', src: 'https://evil.example/x.jpg' },
      { id: 2, media_type: 'image', src: 'http://cdn.shopify.com/insecure.jpg' },
    ] };
    expect(extractShopifyMedia(evil, PAGE_HOST)).toEqual([]);
    expect(extractShopifyMedia({ media: 'nope' }, PAGE_HOST)).toEqual([]);
    expect(extractShopifyMedia(null, PAGE_HOST)).toEqual([]);
  });
});

describe('shopifyProductHandle', () => {
  it.each([
    ['a product URL', 'https://shop.example.com/products/cool-shoe', 'cool-shoe'],
    ['a collection-scoped product', 'https://shop.example.com/collections/sale/products/cool-shoe', 'cool-shoe'],
    ['a .js endpoint URL', 'https://shop.example.com/products/cool-shoe.js', 'cool-shoe'],
    ['a product URL with a variant query', 'https://shop.example.com/products/cool-shoe?variant=42', 'cool-shoe'],
  ])('extracts the handle from %s', (_l, url, handle) => {
    expect(shopifyProductHandle(url)).toBe(handle);
  });

  it.each([
    ['a collection page', 'https://shop.example.com/collections/all'],
    ['the home page', 'https://shop.example.com/'],
    ['a malformed URL', 'not-a-url'],
  ])('returns null for %s', (_l, url) => {
    expect(shopifyProductHandle(url)).toBeNull();
  });
});

describe('ingestShopifyProduct + shopifyPageMedia (store)', () => {
  beforeEach(() => __resetShopify());

  it('serves the ingested media for the matching product URL, and [] for another', () => {
    ingestShopifyProduct('cool-shoe', product, PAGE_HOST);
    expect(shopifyPageMedia('https://shop.example.com/products/cool-shoe')).toHaveLength(3);
    expect(shopifyPageMedia('https://shop.example.com/products/other-thing')).toEqual([]);
    expect(shopifyPageMedia('https://shop.example.com/collections/all')).toEqual([]);
  });

  it('is a no-op when nothing valid resolves', () => {
    ingestShopifyProduct('empty', { media: [{ media_type: 'image', src: 'https://evil.example/x.jpg' }] }, PAGE_HOST);
    expect(shopifyPageMedia('https://shop.example.com/products/empty')).toEqual([]);
  });

  it('__resetShopify clears the store', () => {
    ingestShopifyProduct('cool-shoe', product, PAGE_HOST);
    __resetShopify();
    expect(shopifyPageMedia('https://shop.example.com/products/cool-shoe')).toEqual([]);
  });
});
