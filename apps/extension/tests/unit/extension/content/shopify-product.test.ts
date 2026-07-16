/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://shop.example.com/products/cool-shoe" }
 */
import { afterEach, vi } from 'vitest';
import { ensureShopifyProduct } from '@/extension/content/shopify-product';
import { shopifyPageMedia, __resetShopify } from '@mbd/core/resolvers/sites/shopify';

const PRODUCT_URL = 'https://shop.example.com/products/cool-shoe';
const product = { media: [{ id: 1, media_type: 'image', src: 'https://cdn.shopify.com/s/files/x.jpg', width: 1000, height: 1000 }] };

const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });

afterEach(() => { vi.unstubAllGlobals(); __resetShopify(); document.body.innerHTML = ''; });

describe('ensureShopifyProduct', () => {
  it('fetches /products/<handle>.js (no credentials) and ingests when the page is a Shopify store', async () => {
    document.body.innerHTML = '<link href="https://cdn.shopify.com/s/files/theme.css">';
    const fetchSpy = okJson(product);
    vi.stubGlobal('fetch', fetchSpy);

    await ensureShopifyProduct(PRODUCT_URL);

    expect(fetchSpy).toHaveBeenCalledWith('/products/cool-shoe.js', expect.objectContaining({ credentials: 'omit' }));
    expect(shopifyPageMedia(PRODUCT_URL)).toHaveLength(1);
  });

  it('does nothing on a page with no Shopify CDN signal (not a Shopify store)', async () => {
    document.body.innerHTML = '<img src="https://images.example.com/a.jpg">';
    const fetchSpy = okJson(product);
    vi.stubGlobal('fetch', fetchSpy);

    await ensureShopifyProduct(PRODUCT_URL);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(shopifyPageMedia(PRODUCT_URL)).toEqual([]);
  });

  it('does nothing off a /products/ page (no handle)', async () => {
    document.body.innerHTML = '<link href="https://cdn.shopify.com/s/files/theme.css">';
    const fetchSpy = okJson(product);
    vi.stubGlobal('fetch', fetchSpy);

    await ensureShopifyProduct('https://shop.example.com/collections/all');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is non-fatal when the fetch fails (leaves the store empty)', async () => {
    document.body.innerHTML = '<link href="https://cdn.shopify.com/s/files/theme.css">';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    await expect(ensureShopifyProduct(PRODUCT_URL)).resolves.toBeUndefined();
    expect(shopifyPageMedia(PRODUCT_URL)).toEqual([]);
  });
});
