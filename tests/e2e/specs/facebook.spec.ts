import { test, expect, serviceWorker } from '../fixtures/extension';
import { openPanel, itemCount } from '../helpers/bubble';
import type { BrowserContext, Page } from '@playwright/test';

const figureWithSrc = (page: Page, part: string) =>
  page.locator('figure', { has: page.locator(`img[src*="${part}"]`) });

const PORT = Number(process.env.E2E_PORT) || 5199;
const FB_ORIGIN = 'https://www.facebook.com';

/**
 * The Facebook resolver only reads its hydration-JSON store when
 * `location.hostname` is a real facebook.com origin — it never trusts a
 * third-party page's fbid linkage (see `onFacebook()` in
 * resolvers/sites/facebook.ts). Loading the fixture from the local static
 * server directly (as the other site fixtures do) would make it fall through
 * to the domain-agnostic generic resolver, which does not know how to
 * upgrade an fbcdn thumbnail — so this would silently test the wrong code
 * path. Instead, route every request for the fake facebook.com origin to the
 * same fixture file the static server already hosts: the browser's own
 * `location` is genuinely facebook.com (so the extension's `*.facebook.com`
 * content scripts + the real resolver run), while the bytes still come from
 * `tests/e2e/pages/facebook-photos.html` via `serve.mjs`. The page's own
 * HTML/navigation is served locally via page.route; the fixture's fbcdn
 * <img> URLs are not intercepted, but the test asserts on the resolved
 * candidate src, not on image loads.
 */
async function openFacebookPhotosPage(context: BrowserContext): Promise<Page> {
  const worker = await serviceWorker(context);
  await worker.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.sync.set({ settings: { bubbleEnabled: true } }, () => resolve());
      }),
  );
  const page = await context.newPage();
  await page.route(`${FB_ORIGIN}/**`, async (route) => {
    const res = await fetch(`http://localhost:${PORT}/facebook-photos.html`);
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: await res.text() });
  });
  await page.goto(`${FB_ORIGIN}/media/set/?set=a.1.2`);
  // Playwright pierces the bubble's open shadow root, so the launcher is findable.
  await page.getByRole('button', { name: 'Media Bulk Downloads' }).waitFor();
  return page;
}

test.describe('facebook resolver', () => {
  test('grid thumbnail upgrades to the hydration-JSON full-res original', async ({ context }) => {
    const page = await openFacebookPhotosPage(context);
    await openPanel(page);
    expect(await itemCount(page)).toBe(2);

    // Each tile's fbid (from its `<a href="/photo/?fbid=N">`) keys into the
    // hydration block's ancestor `id: "N"`; the resolver reads that block's
    // `photo_image` (2048x1536 / 1920x1440) and surfaces it in place of the
    // grid's 160x160 `image` thumbnail — the collected item's src is the
    // ORIGINAL, not the thumbnail.
    await expect(figureWithSrc(page, 'FB_GRID_201_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FB_GRID_201_thumb_n')).toHaveCount(0); // thumb was upgraded away
    await expect(figureWithSrc(page, 'FB_GRID_202_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FB_GRID_202_thumb_n')).toHaveCount(0);
  });
});
