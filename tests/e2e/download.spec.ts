import { test, expect, openBubblePage, openPanel } from './fixtures';
import type { Page } from '@playwright/test';

const item = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });

test('downloads an item and records it in Download History', async ({ context }) => {
  const page = await openBubblePage(context, '/media.html');
  await openPanel(page);

  await item(page, 'Alpha').getByRole('button', { name: 'Download' }).click();
  await page.getByRole('button', { name: 'Download history' }).click();

  const panel = page.getByRole('dialog', { name: /download history/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/no downloads yet/i)).toHaveCount(0);
  // The background saved the file and recorded it (e.g. image_1.svg).
  await expect(panel.getByText(/\.svg/i)).toBeVisible();
});
