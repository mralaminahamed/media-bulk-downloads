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
    expect(await itemCount(page)).toBe(4);

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

    const direction = page.getByRole('button', { name: /sort direction/i });
    await expect(direction).toBeDisabled();

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('combobox', { name: /sort/i }).selectOption('name');
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(direction).toBeEnabled();

    const firstSrc = () => page.locator('figure img').first().getAttribute('src');
    const before = await firstSrc();
    await direction.click();
    await expect.poll(firstSrc).not.toBe(before);
  });

  test('the format filter (More) narrows to a single file type', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(5);

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

    await item(page, 'Alpha').getByRole('button', { name: 'Download' }).click();
    await expect(item(page, 'Alpha').locator('[aria-label="Downloaded"]')).toBeVisible();

    await page.getByRole('button', { name: 'State' }).click();
    await page.getByRole('menuitem', { name: 'Downloaded', exact: true }).click();
    await expectItemCount(page, 1);

    await page.getByRole('button', { name: 'Downloaded', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Not downloaded', exact: true }).click();
    await expectItemCount(page, total - 1);

    await page.getByRole('button', { name: 'Remove State filter' }).click();
    await expectItemCount(page, total);
  });

  test('the size-bucket control narrows to the dimensionless items', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    const all = await itemCount(page);
    expect(all).toBe(4);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('group', { name: 'Image size' }).getByRole('button', { name: 'Large' }).click();
    await expectItemCount(page, 2);

    await expect(page.getByRole('button', { name: 'Remove Size filter' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Size filter' }).click();
    await expect.poll(() => itemCount(page)).toBe(all);
  });

  test('the minimum-size floor drops only the item with a known small file size', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(4);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.locator('#filter-min-size').fill('1000');
    await expectItemCount(page, 3);
  });

  test('the base64 toggle hides then shows inline data-URI images', async ({ context }) => {
    const page = await openBubblePage(context, '/mixed.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(4);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    const base64Toggle = page.getByRole('switch', { name: /base64/i });
    await expect(base64Toggle).toHaveAttribute('aria-checked', 'true');

    await base64Toggle.click();
    await expectItemCount(page, 2);

    await base64Toggle.click();
    await expectItemCount(page, 4);
  });
});
