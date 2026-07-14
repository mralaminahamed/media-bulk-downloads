import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';

test.describe('copy / export links', () => {
  test('Copy links puts the shown media URLs on the clipboard', async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);

    await page.getByRole('button', { name: /more download options/i }).click();
    await page.getByRole('menuitem', { name: /copy links/i }).click();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/https?:\/\//);
    // One line per shown item (5 collected).
    expect(clip.split(/\r?\n/).filter(Boolean).length).toBe(5);
  });

  test('the split menu closes after choosing Copy links', async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await page.getByRole('button', { name: /more download options/i }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: /copy links/i }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});
