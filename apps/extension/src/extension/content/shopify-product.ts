import { shopifyProductHandle, ingestShopifyProduct } from '@mbd/core/resolvers/sites/shopify';

/**
 * Prime the Shopify resolver's store for the current product page (isolated
 * content script). `collectMedia` is synchronous + network-free by contract, so
 * this runs BEFORE it (in the GET_IMAGES async prelude) and does the one network
 * step the resolver needs: a same-origin fetch of the store's public
 * `/products/<handle>.js` AJAX endpoint, whose `media[]` carries the complete
 * variant-image + product-video set the passive image rule can't reach.
 *
 * Same-origin so it needs no host permission and no page-CSP relaxation (Shopify's
 * own JS hits this endpoint; `connect-src 'self'` always allows it). `credentials:
 * 'omit'` because the endpoint is public — never send the store's cookies. An
 * AbortController timeout keeps a slow/hostile endpoint from stalling collection.
 */

const FETCH_TIMEOUT_MS = 3000;

/** True when the page looks like a Shopify store — any asset served from the
 *  Shopify CDN (`cdn.shopify.com`) or a store's own `/cdn/shop/` path. Shopify has
 *  no fixed host, so this DOM signal (the codebase's canonical Shopify marker) is
 *  the detection. Isolated-world DOM read; no MAIN-world `window.Shopify` needed. */
function isShopifyStorePage(): boolean {
  return !!document.querySelector(
    'link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"], img[src*="cdn.shopify.com"],'
    + 'link[href*="/cdn/shop/"], script[src*="/cdn/shop/"], img[src*="/cdn/shop/"]',
  );
}

/** Fetch + ingest this page's product media if it's a Shopify product page.
 *  Best-effort: any failure (not Shopify, no handle, non-ok, timeout, bad JSON)
 *  leaves the store untouched — collection proceeds with the passive rules. */
export async function ensureShopifyProduct(pageUrl: string): Promise<void> {
  const handle = shopifyProductHandle(pageUrl);
  if (!handle || !isShopifyStorePage()) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`/products/${encodeURIComponent(handle)}.js`, {
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const product = (await res.json()) as unknown;
    ingestShopifyProduct(handle, product, location.hostname);
  } catch {
    /* not a Shopify product page, offline, aborted, or non-JSON — non-fatal */
  } finally {
    clearTimeout(timer);
  }
}
