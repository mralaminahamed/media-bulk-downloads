import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount, expectItemCount } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const figureWithSrc = (page: Page, part: string) =>
  page.locator('figure', { has: page.locator(`img[src*="${part}"]`) });
const previewModal = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

async function excludeHost(page: Page, item: ReturnType<Page['locator']>): Promise<void> {
  await item.getByRole('button', { name: 'View Details' }).click();
  await expect(previewModal(page)).toBeVisible();
  await page.getByRole('button', { name: 'Exclude source' }).click();
  await page.getByRole('menuitem', { name: /exclude site/i }).click();
}

test.describe('realistic sites', () => {
  test('X/Twitter: collapses name= size variants and excludes the twimg host', async ({ context }) => {
    const page = await openBubblePage(context, '/twitter.html');
    await openPanel(page);
    // og:image + PhotoA (two name= sizes → one) + PhotoB + avatar = 4.
    expect(await itemCount(page)).toBe(4);
    await expect(figureWithSrc(page, 'AAA111')).toHaveCount(1); // size variants collapsed

    // Every item is on pbs.twimg.com → excluding the site clears the grid.
    await excludeHost(page, figureWithSrc(page, 'BBB222'));
    await expect(figureWithSrc(page, 'BBB222')).toHaveCount(0);
    await expectItemCount(page, 0);
  });

  test('Instagram: upgrades the thumbnail to the hydration-JSON original + reel poster', async ({ context }) => {
    const page = await openBubblePage(context, '/instagram.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(2);
    // The resolver read image_versions2 and surfaced the 1080 candidate, not the
    // on-page thumbnail; the reel (media_type 2) surfaces its poster.
    await expect(figureWithSrc(page, 'IG_A_1080')).toHaveCount(1);
    await expect(figureWithSrc(page, 'IG_REEL_POSTER')).toHaveCount(1);
    await expect(figureWithSrc(page, 'IG_A_THUMB')).toHaveCount(0); // thumb was upgraded away
  });

  test('Instagram: the reel is a Video-kind item (kind filter)', async ({ context }) => {
    const page = await openBubblePage(context, '/instagram.html');
    await openPanel(page);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'IG_REEL_POSTER')).toHaveCount(1);
  });

  test('Instagram: favourite the post and see it in the Favourites panel', async ({ context }) => {
    const page = await openBubblePage(context, '/instagram.html');
    await openPanel(page);
    await figureWithSrc(page, 'IG_A_1080').getByRole('button', { name: /add favourite/i }).click();
    await page.getByRole('button', { name: 'Favourites' }).click();
    await expect(page.getByRole('dialog', { name: /favourites/i }).getByRole('button', { name: /^remove$/i })).toHaveCount(1);
  });

  test('Facebook: collapses the same photo across edge PoPs + signed queries', async ({ context }) => {
    const page = await openBubblePage(context, '/facebook.html');
    await openPanel(page);
    // Photo 1 (two edge hosts) collapses to one; photo 2 is one → 2 items total.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'FB_PHOTO_1_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FB_PHOTO_2_n')).toHaveCount(1);

    // Excluding the fbcdn site removes both photos at once.
    await excludeHost(page, figureWithSrc(page, 'FB_PHOTO_2_n'));
    await expect(figureWithSrc(page, 'FB_PHOTO_2_n')).toHaveCount(0);
    await expectItemCount(page, 0);
  });

  test('Generic web: collects srcset / picture / lazy / background / og / gallery media', async ({ context }) => {
    const page = await openBubblePage(context, '/web.html');
    await openPanel(page);
    // A rich mix of patterns — assert the distinctive ones were each collected.
    await expect(figureWithSrc(page, 'og-hero')).toHaveCount(1);         // og:image meta
    await expect(figureWithSrc(page, 'large.jpg')).toHaveCount(1);       // srcset 1600w winner
    await expect(figureWithSrc(page, 'pic-2x.webp')).toHaveCount(1);     // <picture> source
    await expect(figureWithSrc(page, 'lazy-original')).toHaveCount(1);   // data-src lazy
    await expect(figureWithSrc(page, 'backdrop')).toHaveCount(1);        // CSS background-image
    await expect(figureWithSrc(page, '120px-Example')).toHaveCount(1);   // wikipedia thumb (item)
    await expect(figureWithSrc(page, 'shirt_400x400')).toHaveCount(1);   // shopify product
    await expect(figureWithSrc(page, 'redd.it')).not.toHaveCount(0);     // gallery link
    expect(await itemCount(page)).toBeGreaterThanOrEqual(8);
  });
});
