import type { BrowserContext, Page } from '@playwright/test';
import { expect, serviceWorker } from '../fixtures/extension';

/**
 * The bubble is off by default (`bubbleEnabled: false`). Seed sync settings
 * through the service worker so the content script mounts the on-page bubble,
 * then open the fixture page and wait for the launcher. Returns the page with
 * the bubble ready. `withDefaults` in the content script fills every other field.
 */
export async function openBubblePage(context: BrowserContext, url: string): Promise<Page> {
  const worker = await serviceWorker(context);
  await worker.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.sync.set({ settings: { bubbleEnabled: true } }, () => resolve());
      }),
  );
  const page = await context.newPage();
  await page.goto(url);
  // Playwright pierces the bubble's open shadow root, so the launcher is findable.
  await page.getByRole('button', { name: 'Media Bulk Downloads' }).waitFor();
  return page;
}

/** Open the bubble panel and wait for the collected grid (status line) to settle. */
export async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Media Bulk Downloads' }).click();
  // The panel's App scans the page on mount; wait for the loaded status line.
  await expect(page.getByText(/on this page/i)).toBeVisible();
}

/** Count of collected grid items (each item exposes a "View Details" button). */
export async function itemCount(page: Page): Promise<number> {
  return page.getByRole('button', { name: 'View Details' }).count();
}
