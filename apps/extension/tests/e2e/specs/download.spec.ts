import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const item = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });
const historyPanel = (page: Page) => page.getByRole('dialog', { name: /download history/i });

test.describe('download flow', () => {
  test('downloads a single item and records it in Download History', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await item(page, 'Alpha').getByRole('button', { name: 'Download' }).click();
    await page.getByRole('button', { name: 'Download history' }).click();

    const panel = historyPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/no downloads yet/i)).toHaveCount(0);
    await expect(panel.getByText(/\.svg/i)).toHaveCount(1);
  });

  test('re-downloading from history records a second entry', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await item(page, 'Alpha').getByRole('button', { name: 'Download' }).click();
    await item(page, 'Beta').getByRole('button', { name: 'Download' }).click();

    await page.getByRole('button', { name: 'Download history' }).click();
    await expect(historyPanel(page).getByText(/\.svg/i)).toHaveCount(2);
  });

  test('the download split-button offers ZIP, copy, and export options', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await page.getByRole('button', { name: /more download options/i }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /as separate files/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /as zip archive/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /copy links/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /export links/i })).toBeVisible();
  });

  test('clears the Download History via the two-step confirm', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await item(page, 'Alpha').getByRole('button', { name: 'Download' }).click();

    await page.getByRole('button', { name: 'Download history' }).click();
    const panel = historyPanel(page);
    await expect(panel.getByText(/\.svg/i)).toHaveCount(1);
    await panel.getByRole('button', { name: /clear all/i }).click();
    await panel.getByRole('button', { name: /confirm/i }).click();
    await expect(panel.getByText(/no downloads yet/i)).toBeVisible();
  });

});
