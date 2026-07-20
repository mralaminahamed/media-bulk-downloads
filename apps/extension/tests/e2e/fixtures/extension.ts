import { test as base, chromium, expect as baseExpect, type BrowserContext, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extensionPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.output', 'chrome-mv3');

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
export async function serviceWorker(context: BrowserContext): Promise<Worker> {
  const [existing] = context.serviceWorkers();
  return existing ?? (await context.waitForEvent('serviceworker'));
}
