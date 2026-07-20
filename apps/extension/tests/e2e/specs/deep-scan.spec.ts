import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';

test('runs a deep scan without dropping the collected grid', async ({ context }) => {
  const page = await openBubblePage(context, '/media.html');
  await openPanel(page);
  expect(await itemCount(page)).toBe(5);

  await page.getByRole('button', { name: 'Deep scan' }).click();
  await expect(async () => expect(await itemCount(page)).toBe(5)).toPass({ timeout: 6000 });
});

test('deep scan surfaces media that only loads on scroll', async ({ context }) => {
  const page = await openBubblePage(context, '/lazyscroll.html');
  await openPanel(page);
  expect(await itemCount(page)).toBe(1);

  await page.getByRole('button', { name: 'Deep scan' }).click();
  await expect.poll(() => itemCount(page)).toBeGreaterThan(1);
});
