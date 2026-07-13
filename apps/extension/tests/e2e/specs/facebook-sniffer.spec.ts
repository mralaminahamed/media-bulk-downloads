import { test, expect, serviceWorker } from '../fixtures/extension';
import { openPanel, itemCount } from '../helpers/bubble';
import type { BrowserContext, Page } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 5199;
const FB_ORIGIN = 'https://www.facebook.com';

const figureWithSrc = (page: Page, part: string) =>
  page.locator('figure', { has: page.locator(`img[src*="${part}"]`) });

// Two-chunk NDJSON: viewer_image originals (>=1024) for the two grid fbids.
const PHOTOS_NDJSON =
  '{"data":{"viewer":{"news_feed":{"edges":[{"node":{"id":"301","viewer_image":{"uri":"https://scontent-a.xx.fbcdn.net/v/t39.30808-6/FBG_301_orig_n.jpg?oh=00_OA&oe=7A","width":2048,"height":1365}}}]}}}}\n' +
  '{"data":{"node":{"id":"302","viewer_image":{"uri":"https://scontent-b.xx.fbcdn.net/v/t39.30808-6/FBG_302_orig_n.jpg?oh=00_OB&oe=7B","width":2048,"height":1536}}}}';

// Reel graphql: progressive_url mp4 (no playable_url — the real reel shape) + cover.
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
  // The fixture's inline script also pulls on DOMContentLoaded, which fires (and
  // races) the isolated relay's own async content-script import — that first
  // pull is racy and its result may be dropped (no replay for the FB sniffer,
  // unlike the HLS one). The launcher button existing PROVES that same import
  // has already resolved (it renders the on-page bubble), so a scroll fired only
  // now is a safe, unraced second pull: the fixture's `once` scroll listener
  // fires its XHR, the relay is already listening, and the response is awaited
  // below before the panel's very first scan runs. This matters because the FB
  // resolver's candidate for a fbid can change between scans as the sniffed
  // store fills in — the grid thumbnail and its later-sniffed original are
  // DIFFERENT canonical src keys, so a scan that already collected the
  // thumbnail keeps it forever alongside any later "upgrade" (dedup is by src,
  // not by DOM identity). The fixture must therefore never be scanned
  // pre-upgrade in the first place.
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
    // openFbSniffer already waited out the sniffed graphql round trip, so this
    // very first scan (keyed by each tile's /page/photos/<id>/ anchor) already
    // resolved both tiles to their viewer_image originals — proving the sniffer
    // (not the old hydration-JSON path) did the upgrade.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'FBG_301_orig_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FBG_302_orig_n')).toHaveCount(1);

    // A subsequent Deep scan (re-collecting the same DOM) must not regress the
    // upgrade or duplicate the tile with its pre-upgrade thumbnail src.
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
        await gate; // hold the original until the panel has collected grid-only
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PHOTOS_NDJSON });
        return;
      }
      const res = await fetch(`http://localhost:${PORT}/facebook-photos-grid.html`);
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: await res.text() });
    });
    await page.goto(`${FB_ORIGIN}/page/photos`);
    await page.getByRole('button', { name: 'Media Bulk Downloads' }).waitFor();
    await openPanel(page);

    // Graphql still gated: the two tiles are collected at GRID resolution.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'FBG_301_grid_n')).toHaveCount(1);

    // Release the original + deep-scan (drives the re-fetch + re-collect).
    releaseGraphql();
    await page.getByRole('button', { name: 'Deep scan' }).click();

    // Upgraded IN PLACE — originals shown, grid rows gone, still exactly 2 items
    // (without the mediaKey merge this would be 4: grid + original for each).
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

    // With the mp4 sniffed and keyed to reel fbid 401, the cover tile resolves
    // to a VIDEO: its figure shows the poster and the caption reads the mp4 type.
    // Without the fix it would fall back to a plain image (no "MP4" label).
    await expect(figureWithSrc(page, 'FBR_401_cover_n')).toHaveCount(1);
    await expect(page.getByText('MP4', { exact: false }).first()).toBeVisible();
  });
});
