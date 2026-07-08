import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const item = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });

test('adds a favourite and lists it in the Favourites panel', async ({ context }) => {
  const page = await openBubblePage(context, '/media.html');
  await openPanel(page);

  await item(page, 'Alpha').getByRole('button', { name: 'Add favourite' }).click();
  await page.getByRole('button', { name: 'Favourites' }).click();

  const panel = page.getByRole('dialog', { name: /favourites/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/no favourites|nothing saved/i)).toHaveCount(0);
  // The saved data: image is listed (its type label is "Embedded image").
  await expect(panel.getByText(/embedded image/i)).toBeVisible();
});
