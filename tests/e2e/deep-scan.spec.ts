import { test, expect, openBubblePage, openPanel, itemCount } from './fixtures';

test('runs a deep scan without dropping the collected grid', async ({ context }) => {
  const page = await openBubblePage(context, '/media.html');
  await openPanel(page);
  expect(await itemCount(page)).toBe(5);

  await page.getByRole('button', { name: 'Deep scan' }).click();
  // The static fixture has no lazy-loaded media, so the scan finds nothing new;
  // it must complete and keep the 5 already-collected items (not crash/drop them).
  await expect(async () => expect(await itemCount(page)).toBe(5)).toPass({ timeout: 6000 });
});
