import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount, expectItemCount } from '../helpers/bubble';
import type { Page } from '@playwright/test';

/** The figure for a given item, keyed by its alt text (mirrors download.spec.ts). */
const item = (page: Page, alt: string) =>
  page.locator('figure', { has: page.locator(`img[alt="${alt}"]`) });

test.describe('filters, search, and empty state', () => {
  test('kind filters narrow the grid on a mixed page', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(4); // 2 images + 1 video + 1 audio

    await page.getByRole('button', { name: 'Images', exact: true }).click();
    expect(await itemCount(page)).toBe(2);

    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);

    await page.getByRole('button', { name: 'Audio', exact: true }).click();
    expect(await itemCount(page)).toBe(1);

    await page.getByRole('button', { name: 'All', exact: true }).click();
    expect(await itemCount(page)).toBe(4);
  });

  test('the search box narrows the grid by name/alt', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);

    await page.getByRole('searchbox').fill('Img1');
    expect(await itemCount(page)).toBe(1);

    await page.getByRole('searchbox').fill('');
    expect(await itemCount(page)).toBe(4);
  });

  test('shows an empty state on a page with no media', async ({ context }) => {
    const page = await openBubblePage(context, '/empty.html');
    await page.getByRole('button', { name: 'Media Bulk Downloads' }).click();
    await expect(page.getByText('No media here', { exact: true })).toBeVisible();
    expect(await itemCount(page)).toBe(0);
  });

  test('sort direction is disabled until a sort key is chosen, then reverses the order', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    // With the default (collection) order there is nothing to reverse.
    const direction = page.getByRole('button', { name: /sort direction/i });
    await expect(direction).toBeDisabled();

    // Choose a sort key in the More popover → the direction toggle enables.
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('combobox', { name: /sort/i }).selectOption('name');
    await page.getByRole('button', { name: 'More', exact: true }).click(); // close the popover
    await expect(direction).toBeEnabled();

    const firstSrc = () => page.locator('figure img').first().getAttribute('src');
    const before = await firstSrc();
    await direction.click(); // flip ascending/descending
    await expect.poll(firstSrc).not.toBe(before);
  });

  test('the format filter (More) narrows to a single file type', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(5); // 3 svg (data:) + fbcdn jpg + other jpg

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('combobox', { name: /format/i }).selectOption('svg');
    expect(await itemCount(page)).toBe(3);

    await page.getByRole('combobox', { name: /format/i }).selectOption('jpeg');
    expect(await itemCount(page)).toBe(2);

    await page.getByRole('combobox', { name: /format/i }).selectOption('all');
    expect(await itemCount(page)).toBe(5);
  });

  test('the Downloaded filter narrows to downloaded vs not-downloaded items', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    const total = await itemCount(page);
    expect(total).toBeGreaterThan(1);

    // Download exactly one item (same click pattern as download.spec.ts).
    await item(page, 'Alpha').getByRole('button', { name: 'Download' }).click();
    // The item gains its "downloaded" badge once history records it. Scope to
    // the figure — the badge shares its aria-label with the item-level "Downloaded" mark.
    await expect(item(page, 'Alpha').locator('[aria-label="Downloaded"]')).toBeVisible();

    // The State chip lives in the primary row — no "More" needed.
    await page.getByRole('button', { name: 'State' }).click();
    await page.getByRole('menuitem', { name: 'Downloaded', exact: true }).click();
    await expectItemCount(page, 1);

    // Selecting a value relabels the chip's trigger to that value; reopen it to switch.
    await page.getByRole('button', { name: 'Downloaded', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Not downloaded', exact: true }).click();
    await expectItemCount(page, total - 1);

    // Clear back to "All items" via the chip's × control.
    await page.getByRole('button', { name: 'Remove State filter' }).click();
    await expectItemCount(page, total);
  });

  test('the size-bucket control narrows to the dimensionless items', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    const all = await itemCount(page);
    expect(all).toBe(4); // 2 images (120x120) + video + audio

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('group', { name: 'Image size' }).getByRole('button', { name: 'Large' }).click();
    // Large = edge >= 1024px. Both images (edge 120) are hidden. The video and
    // audio survive too — collect.ts's collectAv() always reports width/height
    // 0 for <video>/<audio> (never reads the element's intrinsic size), so both
    // count as "unknown dims", which the size-bucket rule never hides.
    await expectItemCount(page, 2);

    // The active Size filter surfaces as a removable chip in the primary row —
    // clearing it via × restores the full grid.
    await expect(page.getByRole('button', { name: 'Remove Size filter' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Size filter' }).click();
    await expect.poll(() => itemCount(page)).toBe(all);
  });

  test('the minimum-size floor drops only the item with a known small file size', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(4);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    // Img1 is genuinely base64-encoded, so collection computes a real (~118
    // byte) fileSize for it. Every other item (Img2's URL-encoded-but-not-
    // base64 data URI, the remote video, the remote audio) has fileSize 0
    // ("unknown"), which the floor never drops. A 1000 KB floor therefore
    // drops exactly Img1.
    await page.locator('#filter-min-size').fill('1000');
    await expectItemCount(page, 3);
  });

  test('the base64 toggle hides then shows inline data-URI images', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(4);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    const base64Toggle = page.getByRole('switch', { name: /base64/i });
    await expect(base64Toggle).toHaveAttribute('aria-checked', 'true'); // on by default

    await base64Toggle.click(); // turn off → both inline images (Img1, Img2) are excluded
    await expectItemCount(page, 2);

    await base64Toggle.click(); // turn back on → both return
    await expectItemCount(page, 4);
  });
});
