import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const figureWithSrc = (page: Page, part: string) =>
  page.locator('figure', { has: page.locator(`img[src*="${part}"]`) });

test.describe('threads video', () => {
  test('a mounted <video> https mp4 is collected as a downloadable MP4 item', async ({ context }) => {
    const page = await openBubblePage(context, '/threads-video.html');
    await openPanel(page);

    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'THREADS_VID_POSTER')).toHaveCount(1);
    await expect(page.getByText('MP4', { exact: false }).first()).toBeVisible();
  });
});
