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
});
