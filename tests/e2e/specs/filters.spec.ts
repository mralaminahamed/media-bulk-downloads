import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';

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
});
