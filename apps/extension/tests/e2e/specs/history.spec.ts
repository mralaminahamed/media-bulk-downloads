import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const item = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });
const historyPanel = (page: Page) => page.getByRole('dialog', { name: /download history/i });

async function downloadThenOpenHistory(page: Page, alt: string) {
  await item(page, alt).getByRole('button', { name: 'Download' }).click();
  await page.getByRole('button', { name: 'Download history' }).click();
  return historyPanel(page);
}

test.describe('download history actions', () => {
  test('a recorded entry exposes open-file, reveal, re-download, and open-source', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    const panel = await downloadThenOpenHistory(page, 'Alpha');

    await expect(panel.getByRole('button', { name: /re-download/i })).toBeVisible();
    await expect(panel.getByRole('button', { name: /open file/i })).toBeVisible();
    await expect(panel.getByRole('button', { name: /show in folder/i })).toBeVisible();
    await expect(panel.getByRole('button', { name: /open source in new tab/i })).toBeVisible();
  });

  test('removing an entry empties the history', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    const panel = await downloadThenOpenHistory(page, 'Alpha');

    await expect(panel.getByText(/\.svg/i)).toHaveCount(1);
    await panel.getByRole('button', { name: /^remove$/i }).click();
    await expect(panel.getByText(/no downloads yet/i)).toBeVisible();
  });
});
