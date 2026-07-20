import { test, expect, serviceWorker } from '../fixtures/extension';
import { openPanel, itemCount } from '../helpers/bubble';
import type { BrowserContext, Page } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 5199;
const FB_ORIGIN = 'https://www.facebook.com';

const figureWithSrc = (page: Page, part: string) =>
  page.locator('figure', { has: page.locator(`img[src*="${part}"]`) });

const PHOTOS_NDJSON =
  '{"data":{"viewer":{"news_feed":{"edges":[{"node":{"id":"301","viewer_image":{"uri":"https://scontent-a.xx.fbcdn.net/v/t39.30808-6/FBG_301_orig_n.jpg?oh=00_OA&oe=7A","width":2048,"height":1365}}}]}}}}\n' +
  '{"data":{"node":{"id":"302","viewer_image":{"uri":"https://scontent-b.xx.fbcdn.net/v/t39.30808-6/FBG_302_orig_n.jpg?oh=00_OB&oe=7B","width":2048,"height":1536}}}}';

const REEL_NDJSON =
  '{"data":{"node":{"id":"401","__typename":"Video","progressive_url":"https://scontent-c.xx.fbcdn.net/o1/v/t2/f2/FBR_401_prog.mp4?oh=00_PA&oe=7C","preferred_thumbnail":{"image":{"uri":"https://scontent-c.xx.fbcdn.net/v/t39.30808-6/FBR_401_cover_n.jpg?oh=00_CA&oe=6C","width":640,"height":360}}}}}';

/**
 * Route the fake facebook.com origin so the browser's own `location.hostname`
 * is genuinely facebook.com (real resolver + MAIN-world sniffer run), the page
 * HTML comes from the local fixture, and every /api/graphql request is answered
 * with a `text/html` NDJSON body — the exact channel + content-type Facebook
 * uses and the sniffer must now accept.
 */
async function openFbSniffer(context: BrowserContext, htmlFile: string, ndjson: string): Promise<Page> {
  const worker = await serviceWorker(context);
  await worker.evaluate(
    () => new Promise<void>((resolve) => chrome.storage.sync.set({ settings: { bubbleEnabled: true } }, () => resolve())),
  );
  const page = await context.newPage();
  await page.route(`${FB_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/graphql')) {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ndjson });
      return;
    }
    const res = await fetch(`http://localhost:${PORT}/${htmlFile}`);
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: await res.text() });
  });
  await page.goto(`${FB_ORIGIN}/page/photos`);
  await page.getByRole('button', { name: 'Media Bulk Downloads' }).waitFor();
  const graphqlSeen = page.waitForResponse((r) => r.url().includes('/api/graphql'));
  await page.mouse.wheel(0, 50);
  await graphqlSeen;
  await page.waitForTimeout(300);
  return page;
}

test.describe('facebook sniffer (text/html NDJSON graphql)', () => {
  test('grid photos upgrade to sniffed >=1024 originals', async ({ context }) => {
    const page = await openFbSniffer(context, 'facebook-photos-grid.html', PHOTOS_NDJSON);
    await openPanel(page);
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'FBG_301_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FBG_302_orig_n')).toHaveCount(1);

    await page.getByRole('button', { name: 'Deep scan' }).click();

    await expect(figureWithSrc(page, 'FBG_301_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FBG_301_grid_n')).toHaveCount(0);
    await expect(figureWithSrc(page, 'FBG_302_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FBG_302_grid_n')).toHaveCount(0);
  });

  test('a grid tile collected before its original is sniffed upgrades in place (no duplicate)', async ({ context }) => {
    const worker = await serviceWorker(context);
    await worker.evaluate(
      () => new Promise<void>((resolve) => chrome.storage.sync.set({ settings: { bubbleEnabled: true } }, () => resolve())),
    );
    const page = await context.newPage();
    let releaseGraphql: () => void = () => {};
    const gate = new Promise<void>((r) => { releaseGraphql = r; });
    await page.route(`${FB_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/api/graphql')) {
        await gate;
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PHOTOS_NDJSON });
        return;
      }
      const res = await fetch(`http://localhost:${PORT}/facebook-photos-grid.html`);
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: await res.text() });
    });
    await page.goto(`${FB_ORIGIN}/page/photos`);
    await page.getByRole('button', { name: 'Media Bulk Downloads' }).waitFor();
    await openPanel(page);

    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'FBG_301_grid_n')).toHaveCount(1);

    releaseGraphql();
    await page.getByRole('button', { name: 'Deep scan' }).click();

    await expect(figureWithSrc(page, 'FBG_301_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FBG_302_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FBG_301_grid_n')).toHaveCount(0);
    await expect(figureWithSrc(page, 'FBG_302_grid_n')).toHaveCount(0);
    expect(await itemCount(page)).toBe(2);
  });

  test('a reel resolves to a downloadable mp4 via progressive_url', async ({ context }) => {
    const page = await openFbSniffer(context, 'facebook-reel.html', REEL_NDJSON);
    await openPanel(page);
    await page.getByRole('button', { name: 'Deep scan' }).click();

    await expect(figureWithSrc(page, 'FBR_401_cover_n')).toHaveCount(1);
    await expect(page.getByText('MP4', { exact: false }).first()).toBeVisible();
  });
});
