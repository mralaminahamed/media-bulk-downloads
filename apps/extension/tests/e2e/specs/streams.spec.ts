import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount } from '../helpers/bubble';

test.describe('HLS / DASH stream collection', () => {
  test('collects .m3u8 and .mpd manifests as video items when capture is enabled', async ({ context }) => {
    const page = await openBubblePage(context, '/streams.html', { captureHlsStreams: true });
    await openPanel(page);
    expect(await itemCount(page)).toBe(3);

    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(2);

    await page.getByRole('button', { name: 'Images', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
  });

  test('surfaces no streams when capture is disabled (default)', async ({ context }) => {
    const page = await openBubblePage(context, '/streams.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(1);
  });
});
