import { test as base, chromium, expect as baseExpect, type BrowserContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extensionPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.output', 'chrome-mv3');

/**
 * Playwright fixtures that load the built MV3 extension into a persistent
 * Chromium context (the only way Chromium loads an unpacked extension) and
 * expose the extension id. Per Playwright's chrome-extensions guide, the
 * `chromium` channel lets the extension run headless.
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = await serviceWorker(context);
    await use(worker.url().split('/')[2]);
  },
});

export const expect = baseExpect;

/** The extension's background service worker (waits for it if not yet started). */
async function serviceWorker(context: BrowserContext) {
  const [existing] = context.serviceWorkers();
  return existing ?? (await context.waitForEvent('serviceworker'));
}

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
