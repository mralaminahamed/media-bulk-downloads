import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';

test('runs a deep scan without dropping the collected grid', async ({ context }) => {
  const page = await openBubblePage(context, '/media.html');
  await openPanel(page);
  expect(await itemCount(page)).toBe(5);

  await page.getByRole('button', { name: 'Deep scan' }).click();
  // The static fixture has no lazy-loaded media, so the scan finds nothing new;
  // it must complete and keep the 5 already-collected items (not crash/drop them).
  await expect(async () => expect(await itemCount(page)).toBe(5)).toPass({ timeout: 6000 });
});

test('deep scan surfaces media that only loads on scroll', async ({ context }) => {
  const page = await openBubblePage(context, '/lazyscroll.html');
  await openPanel(page);
  expect(await itemCount(page)).toBe(1); // only the above-the-fold image at first

  // The fixture appends a second image once the page is scrolled; deep scan drives
  // that scroll, so the revealed item is collected.
  await page.getByRole('button', { name: 'Deep scan' }).click();
  // (the fixture reveals one more, and the scan settles above the initial count)
  await expect.poll(() => itemCount(page)).toBeGreaterThan(1);
});
