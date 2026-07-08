import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const modal = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

test.describe('preview modal', () => {
  test('shows the image and Next cycles to another item', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await page.locator('figure').first().getByRole('button', { name: 'View Details' }).click();
    await expect(modal(page)).toBeVisible();
    const img = modal(page).locator('img').first();
    await expect(img).toBeVisible();
    const first = await img.getAttribute('src');

    await modal(page).getByRole('button', { name: /next image/i }).click();
    await expect(img).not.toHaveAttribute('src', first ?? '');
  });

  test('closes via the Close button', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await page.locator('figure').first().getByRole('button', { name: 'View Details' }).click();
    await expect(modal(page)).toBeVisible();
    await modal(page).getByRole('button', { name: 'Close' }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test('closes on Escape', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await page.locator('figure').first().getByRole('button', { name: 'View Details' }).click();
    await expect(modal(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal(page)).toHaveCount(0);
  });
});
