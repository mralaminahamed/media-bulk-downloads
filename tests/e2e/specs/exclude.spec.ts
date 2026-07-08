import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';
import type { Page, Locator } from '@playwright/test';

const itemByAlt = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });
const fbItem = (page: Page) =>
  page.locator('figure', { has: page.locator('img[src*="fbcdn"]') });
// The preview/details modal (the only aria-modal dialog on the grid).
const previewModal = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

async function openPreview(page: Page, item: Locator): Promise<void> {
  await item.getByRole('button', { name: 'View Details' }).click();
  await expect(previewModal(page)).toBeVisible();
}
async function openExcludeMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exclude source' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test.describe('exclude flow', () => {
  test('excludes one image by URL and re-filters the grid, leaving the rest', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(5);

    await openPreview(page, itemByAlt(page, 'Alpha'));
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: 'Exclude this image' }).click();

    await expect(previewModal(page)).toHaveCount(0);
    await expect(itemByAlt(page, 'Alpha')).toHaveCount(0);
    // Only Alpha went — the other data: images and the fbcdn item stay.
    await expect(itemByAlt(page, 'Beta')).toHaveCount(1);
    await expect(fbItem(page)).toHaveCount(1);
    expect(await itemCount(page)).toBe(4);
  });

  test('excludes a whole host and removes every matching item at once', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await openPreview(page, fbItem(page));
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: /exclude site/i }).click();

    await expect(fbItem(page)).toHaveCount(0);
    await expect(itemByAlt(page, 'OtherHost')).toHaveCount(1); // different host survives
    expect(await itemCount(page)).toBe(4);
  });

  test('offers no "Exclude site" option for a hostless data: image', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openPreview(page, itemByAlt(page, 'Alpha'));
    await openExcludeMenu(page);
    await expect(page.getByRole('menuitem')).toHaveCount(1);
    await expect(page.getByRole('menuitem', { name: /exclude site/i })).toHaveCount(0);
  });

  test('excludes via the keyboard: the menu auto-focuses its first item, Enter activates', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openPreview(page, itemByAlt(page, 'Alpha'));
    await openExcludeMenu(page);
    // WAI-ARIA menu button: focus lands on the first item on open.
    await expect(page.getByRole('menuitem', { name: 'Exclude this image' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(itemByAlt(page, 'Alpha')).toHaveCount(0);
  });

  test('arrow-navigates to the site option and excludes the host with Enter', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openPreview(page, fbItem(page));
    await openExcludeMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Exclude this image' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: /exclude site/i })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(fbItem(page)).toHaveCount(0);
  });

  test('Escape closes only the exclude menu, keeping the preview open', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openPreview(page, itemByAlt(page, 'Alpha'));
    await openExcludeMenu(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(previewModal(page)).toHaveCount(1); // preview survives
  });

  test('an exclusion persists across closing and reopening the panel', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openPreview(page, itemByAlt(page, 'Alpha'));
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: 'Exclude this image' }).click();
    await expect(itemByAlt(page, 'Alpha')).toHaveCount(0);

    // Toggle the panel closed, then open it again — the exclusion is persisted.
    await page.getByRole('button', { name: 'Media Bulk Downloads' }).click(); // close
    await expect(previewModal(page)).toHaveCount(0);
    await openPanel(page); // reopen (re-scans + re-filters)
    await expect(itemByAlt(page, 'Alpha')).toHaveCount(0);
    expect(await itemCount(page)).toBe(4);
  });

  test('lists exclusions in the Excluded panel; removing one brings the item back', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await openPreview(page, fbItem(page));
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: /exclude site/i }).click();
    await expect(fbItem(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Excluded sources' }).click();
    const panel = page.getByRole('dialog', { name: /excluded/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('fbcdn.net')).toBeVisible();

    // Remove the single entry, then rescan — the fbcdn item is no longer blocked
    // and returns to the grid.
    await panel.getByRole('button', { name: /remove/i }).click();
    await expect(panel.getByText(/no excluded sources/i)).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Rescan page' }).click();
    await expect(fbItem(page)).toHaveCount(1);
  });

  test('Clear all empties the Excluded panel', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openPreview(page, fbItem(page));
    await openExcludeMenu(page);
    await page.getByRole('menuitem', { name: /exclude site/i }).click();

    await page.getByRole('button', { name: 'Excluded sources' }).click();
    const panel = page.getByRole('dialog', { name: /excluded/i });
    await panel.getByRole('button', { name: /clear all/i }).click();
    await panel.getByRole('button', { name: /confirm/i }).click();
    await expect(panel.getByText(/no excluded sources/i)).toBeVisible();
  });
});
