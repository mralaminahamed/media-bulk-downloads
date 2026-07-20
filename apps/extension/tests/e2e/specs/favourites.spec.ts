import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const item = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });
const favPanel = (page: Page) => page.getByRole('dialog', { name: /favourites/i });

async function addFavourite(page: Page, alt: string): Promise<void> {
  await item(page, alt).getByRole('button', { name: /add favourite/i }).click();
}

test.describe('favourites flow', () => {
  test('adds a favourite and lists it in the Favourites panel', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await addFavourite(page, 'Alpha');
    await page.getByRole('button', { name: 'Favourites' }).click();

    const panel = favPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/no favourites|nothing saved/i)).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^remove$/i })).toHaveCount(1);
  });

  test('adds several favourites and lists them all', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await addFavourite(page, 'Alpha');
    await addFavourite(page, 'Beta');
    await addFavourite(page, 'Gamma');
    await page.getByRole('button', { name: 'Favourites' }).click();

    await expect(favPanel(page).getByRole('button', { name: /^remove$/i })).toHaveCount(3);
  });

  test('removes one favourite from the panel, leaving the others', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await addFavourite(page, 'Alpha');
    await addFavourite(page, 'Beta');
    await page.getByRole('button', { name: 'Favourites' }).click();

    const removes = favPanel(page).getByRole('button', { name: /^remove$/i });
    await expect(removes).toHaveCount(2);
    await removes.first().click();
    await expect(removes).toHaveCount(1);
  });

  test('un-favouriting from the grid empties the panel', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await addFavourite(page, 'Alpha');
    await item(page, 'Alpha').getByRole('button', { name: /remove favourite/i }).click();

    await page.getByRole('button', { name: 'Favourites' }).click();
    await expect(favPanel(page).getByText(/no favourites|nothing saved/i)).toBeVisible();
  });

  test('Clear all empties the Favourites panel', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await addFavourite(page, 'Alpha');
    await addFavourite(page, 'Beta');
    await page.getByRole('button', { name: 'Favourites' }).click();

    const panel = favPanel(page);
    await panel.getByRole('button', { name: /clear all/i }).click();
    await panel.getByRole('button', { name: /confirm/i }).click();
    await expect(panel.getByText(/no favourites|nothing saved/i)).toBeVisible();
  });
});
