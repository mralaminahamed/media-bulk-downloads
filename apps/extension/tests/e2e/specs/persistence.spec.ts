import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const fbItem = (page: Page) => page.locator('figure', { has: page.locator('img[src*="fbcdn"]') });

async function secondPage(page: Page): Promise<Page> {
  const p2 = await page.context().newPage();
  await p2.goto('/media.html');
  await p2.getByRole('button', { name: 'Media Bulk Downloads' }).click();
  await expect(p2.getByText(/on this page/i)).toBeVisible();
  return p2;
}

test.describe('cross-page persistence', () => {
  test('a host exclusion applies to a freshly-opened page in the same profile', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await fbItem(page).getByRole('button', { name: 'View Details' }).click();
    await page.getByRole('button', { name: 'Exclude source' }).click();
    await page.getByRole('menuitem', { name: /exclude site/i }).click();
    await expect(fbItem(page)).toHaveCount(0);

    const p2 = await secondPage(page);
    await expect(fbItem(p2)).toHaveCount(0);
    await expect(p2.getByRole('button', { name: 'View Details' })).toHaveCount(4);
  });

  test('a favourite is visible in the panel on a freshly-opened page', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await page.locator('figure').first().getByRole('button', { name: /add favourite/i }).click();

    const p2 = await secondPage(page);
    await p2.getByRole('button', { name: 'Favourites' }).click();
    await expect(p2.getByRole('dialog', { name: /favourites/i }).getByRole('button', { name: /^remove$/i })).toHaveCount(1);
  });
});
