import { test, expect, serviceWorker } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const settings = (page: Page) => page.getByRole('dialog', { name: /settings/i });

async function importBackup(page: Page, json: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await settings(page).locator('input[type="file"]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json),
  });
}

const validBackup = JSON.stringify({
  app: 'media-bulk-downloads',
  version: 1,
  exportedAt: '2026-01-01T00:00:00Z',
  settings: { fileNamePrefix: 'restored_' },
  favourites: [{ src: 'https://cdn.test/fav.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'https://page.test', time: 100 }],
  history: [],
  excluded: [{ value: 'blocked.example.com', kind: 'host', time: 100 }],
});

test.describe('backup import / restore', () => {
  test('restores favourites, excluded sources, and settings from a valid backup', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await importBackup(page, validBackup);

    // Import writes settings (sync) + favourites/history/excluded (local). Read
    // them back through the service worker — the definitive restore evidence.
    const worker = await serviceWorker(context);
    await expect.poll(() =>
      worker.evaluate(() => new Promise((r) => chrome.storage.sync.get('settings', (x) => r((x.settings as { fileNamePrefix?: string })?.fileNamePrefix)))),
    ).toBe('restored_');

    const local = await worker.evaluate(
      () => new Promise((r) => chrome.storage.local.get(null, (x) => r(x))),
    ) as { favourites?: Array<{ src: string }>; excluded?: Array<{ value: string }> };
    expect(local.favourites?.map((f) => f.src)).toContain('https://cdn.test/fav.jpg');
    expect(local.excluded?.map((e) => e.value)).toContain('blocked.example.com');
  });

  test('rejects a malformed backup with an error note and changes nothing', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await importBackup(page, '{ this is not valid json');

    await expect(settings(page).getByText(/not a valid/i)).toBeVisible();
  });

  test('ignores a backup from a different app (wrong app tag)', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await importBackup(page, JSON.stringify({ app: 'some-other-tool', favourites: [], history: [], excluded: [] }));

    await expect(settings(page).getByText(/not a valid/i)).toBeVisible();
  });
});
