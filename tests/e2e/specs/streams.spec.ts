import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';

test.describe('HLS / DASH stream collection', () => {
  test('collects .m3u8 and .mpd manifests as video items when capture is enabled', async ({ context }) => {
    const page = await openBubblePage(context, '/streams.html', { captureHlsStreams: true });
    await openPanel(page);
    // The HLS <source>, the DASH <a> manifest, and the poster image → 3 items.
    expect(await itemCount(page)).toBe(3);

    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(2); // the two stream manifests

    await page.getByRole('button', { name: 'Images', exact: true }).click();
    expect(await itemCount(page)).toBe(1); // the poster thumbnail
  });

  test('surfaces no streams when capture is disabled (default)', async ({ context }) => {
    const page = await openBubblePage(context, '/streams.html');
    await openPanel(page);
    // Only the plain poster image is collected; manifests stay hidden.
    expect(await itemCount(page)).toBe(1);
  });
});
