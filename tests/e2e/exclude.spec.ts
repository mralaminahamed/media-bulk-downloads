import { test, expect, openBubblePage, openPanel, itemCount } from './fixtures';
import type { Page } from '@playwright/test';

// The grid item (a <figure>) that shows the image with the given alt / src match.
const itemByAlt = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });
const fbItem = (page: Page) =>
  page.locator('figure', { has: page.locator('img[src*="fbcdn"]') });

// The preview/details modal (the only aria-modal dialog on the grid).
const previewModal = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

async function openExcludeMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exclude source' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test.describe('exclude flow', () => {
  test('excludes one image by URL and re-filters the grid', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(5);

    await itemByAlt(page, 'Alpha').getByRole('button', { name: 'View Details' }).click();
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: 'Exclude this image' }).click();

    // The preview closes and Alpha is filtered out live.
    await expect(previewModal(page)).toHaveCount(0);
    await expect(itemByAlt(page, 'Alpha')).toHaveCount(0);
    expect(await itemCount(page)).toBe(4);
  });

  test('excludes a whole host and removes every matching item at once', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(5);

    await fbItem(page).getByRole('button', { name: 'View Details' }).click();
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: /exclude site/i }).click();

    // The single (canonically-collapsed) fbcdn item is gone; the other host survives.
    await expect(fbItem(page)).toHaveCount(0);
    await expect(itemByAlt(page, 'OtherHost')).toHaveCount(1);
    expect(await itemCount(page)).toBe(4);
  });

  test('lists exclusions in the Excluded panel and Clear all empties it', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    // Exclude the fbcdn host.
    await fbItem(page).getByRole('button', { name: 'View Details' }).click();
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: /exclude site/i }).click();
    await expect(fbItem(page)).toHaveCount(0);

    // Open the Excluded panel — the host entry is listed.
    await page.getByRole('button', { name: 'Excluded sources' }).click();
    const panel = page.getByRole('dialog', { name: /excluded/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('fbcdn.net')).toBeVisible();

    // Clear all is a two-step confirm.
    await panel.getByRole('button', { name: /clear all/i }).click();
    await panel.getByRole('button', { name: /confirm/i }).click();
    await expect(panel.getByText(/no excluded sources/i)).toBeVisible();
  });
});
