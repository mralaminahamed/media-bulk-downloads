import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';

test.describe('bubble launcher + panel', () => {
  test('the launcher toggles the panel open and closed', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    const launcher = page.getByRole('button', { name: 'Media Bulk Downloads' });

    await launcher.click();
    await expect(page.getByText(/on this page/i)).toBeVisible();

    await launcher.click();
    await expect(page.getByText(/on this page/i)).toHaveCount(0);
  });

  test('Escape closes the open panel', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await page.keyboard.press('Escape');
    await expect(page.getByText(/on this page/i)).toHaveCount(0);
  });

  test('reopening the panel re-scans the page', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await page.getByRole('button', { name: 'Media Bulk Downloads' }).click();
    await expect(page.getByText(/on this page/i)).toHaveCount(0);
    await openPanel(page);
    await expect(page.getByRole('button', { name: 'View Details' })).toHaveCount(5);
  });
});
