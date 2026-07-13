import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel } from '../helpers/bubble';
import type { Page } from '@playwright/test';

type BoundingBox = { x: number; y: number; width: number; height: number };

// Drag from a box's centre by (dx, dy) using real mouse events, which Chromium
// turns into the pointer events the bubble listens for.
async function dragBy(page: Page, box: BoundingBox, dx: number, dy: number): Promise<void> {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up();
}
const dist = (a: BoundingBox, b: BoundingBox) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe('drag & resize positioning', () => {
  test('drags the launcher button to a new position', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    const launcher = page.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = (await launcher.boundingBox())!;

    await dragBy(page, before, -140, -160);

    const after = (await launcher.boundingBox())!;
    expect(dist(before, after)).toBeGreaterThan(60); // it moved, well past the click threshold
    // A sub-threshold drag is a click (opens the panel); this was a real drag, so
    // the panel must NOT have opened.
    await expect(page.getByText(/on this page/i)).toHaveCount(0);
  });

  test('drags the panel to a free point via its header', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    const panel = page.locator('.sheet-in');
    const before = (await panel.boundingBox())!;

    // Grab the header on the (non-button) heading area and drag.
    const heading = page.getByRole('heading', { name: 'Media Bulk Downloads', exact: true });
    await dragBy(page, (await heading.boundingBox())!, -180, 130);

    const after = (await panel.boundingBox())!;
    expect(dist(before, after)).toBeGreaterThan(60);
  });

  test('resizes the panel from its corner grip', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    const panel = page.locator('.sheet-in');
    const before = (await panel.boundingBox())!;

    const grip = page.getByRole('button', { name: /resize panel/i });
    await dragBy(page, (await grip.boundingBox())!, -90, -90);

    const after = (await panel.boundingBox())!;
    const change = Math.abs(after.width - before.width) + Math.abs(after.height - before.height);
    expect(change).toBeGreaterThan(30);
  });

  test('a sub-threshold nudge on the launcher is a click, not a drag (opens the panel)', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    const launcher = page.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = (await launcher.boundingBox())!;

    await dragBy(page, before, 3, 2); // under the 6px drag threshold → treated as a click
    await expect(page.getByText(/on this page/i)).toBeVisible();
    // The launcher didn't move.
    const after = (await launcher.boundingBox())!;
    expect(dist(before, after)).toBeLessThan(6);
  });
});
