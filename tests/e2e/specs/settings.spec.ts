import { test, expect, serviceWorker } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount, expectItemCount } from '../helpers/bubble';
import type { Page, BrowserContext } from '@playwright/test';

const panel = (page: Page) => page.getByRole('dialog', { name: /settings/i });
const openSettings = (page: Page) => page.getByRole('button', { name: 'Settings' }).click();
const save = (page: Page) => panel(page).getByRole('button', { name: 'Save', exact: true });

async function stored(context: BrowserContext): Promise<Record<string, unknown>> {
  const w = await serviceWorker(context);
  return w.evaluate(() => new Promise((r) => chrome.storage.sync.get('settings', (x) => r((x.settings ?? {}) as Record<string, unknown>))));
}

test.describe('settings panel (draft + Save)', () => {
  test('opens with controls; Save is disabled until an edit, and re-disabled when reverted', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    await expect(panel(page)).toBeVisible();
    await expect(save(page)).toBeDisabled();

    const sw = panel(page).getByRole('switch', { name: /exclude base64 images/i });
    await sw.click();
    await expect(save(page)).toBeEnabled();     // dirty
    await sw.click();                            // back to original
    await expect(save(page)).toBeDisabled();     // clean again
  });

  test('every switch flips its stored value through Save', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    // showImageCount defaults on, the rest off — so assert each flips from its
    // own initial state rather than assuming they all go to true.
    const switches: Array<[RegExp, string]> = [
      [/ask where to save/i, 'saveAs'],
      [/exclude base64 images/i, 'excludeBase64Images'],
      [/exclude emoji/i, 'excludeEmoji'],
      [/resolve exact originals/i, 'resolveOriginals'],
      [/capture video streams/i, 'captureHlsStreams'],
      [/click .*load more/i, 'deepScanClickLoadMore'],
      [/show image count/i, 'showImageCount'],
    ];
    const initial: Record<string, boolean> = {};
    for (const [name, key] of switches) {
      const sw = panel(page).getByRole('switch', { name });
      initial[key] = (await sw.getAttribute('aria-checked')) === 'true';
      await sw.click();
    }
    await save(page).click();

    const s = await stored(context);
    for (const [, key] of switches) expect(s[key], key).toBe(!initial[key]);
  });

  test('every number field persists through Save', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    const numbers: Array<[RegExp, string, number]> = [
      [/minimum image size/i, 'minimumImageSize', 250],
      [/max items/i, 'deepScanMaxItems', 2000],
      [/max time/i, 'deepScanMaxSeconds', 60],
      [/max scroll steps/i, 'deepScanMaxScrolls', 100],
      [/thumbnail size/i, 'thumbnailSize', 180],
      [/preview size/i, 'previewSize', 500],
    ];
    for (const [name, , value] of numbers) {
      const field = panel(page).getByRole('spinbutton', { name });
      await field.fill(String(value));
      await field.blur();
    }
    await save(page).click();

    const s = await stored(context);
    for (const [, key, value] of numbers) expect(s[key], key).toBe(value);
  });

  test('text fields (subfolder + filename prefix) persist through Save', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    await panel(page).getByRole('textbox', { name: /save to subfolder/i }).fill('Media/{domain}');
    await panel(page).getByRole('textbox', { name: /file name prefix/i }).fill('pic_');
    await save(page).click();

    const s = await stored(context);
    expect(s.downloadPath).toBe('Media/{domain}');
    expect(s.fileNamePrefix).toBe('pic_');
  });

  test('selects (convert format, bubble corner, panel position) persist through Save', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    await panel(page).getByRole('combobox', { name: /convert images/i }).selectOption('jpeg');
    await panel(page).getByRole('combobox', { name: /bubble corner/i }).selectOption('top-left');
    await panel(page).getByRole('combobox', { name: /panel position/i }).selectOption('center');
    await save(page).click();

    const s = await stored(context) as { convertImagesTo?: string; bubblePosition?: { corner?: string }; bubblePanelPlacement?: string };
    expect(s.convertImagesTo).toBe('jpeg');
    expect(s.bubblePosition?.corner).toBe('top-left');
    expect(s.bubblePanelPlacement).toBe('center');
  });

  test('naming mode (Prefixed → Original) persists through Save', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);
    await panel(page).getByRole('button', { name: 'Original', exact: true }).click();
    await save(page).click();
    expect((await stored(context)).namingMode).toBe('original');
  });

  test('number fields clamp to their bounds on blur', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    const maxItems = panel(page).getByRole('spinbutton', { name: /max items/i });
    await maxItems.fill('99999'); // above max 5000
    await maxItems.blur();
    await expect(maxItems).toHaveValue('5000');

    const maxTime = panel(page).getByRole('spinbutton', { name: /max time/i });
    await maxTime.fill('1'); // below min 5
    await maxTime.blur();
    await expect(maxTime).toHaveValue('5');
  });

  test('editing then Save applies "Exclude Base64 Images" on the next scan', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(5); // 3 data: SVGs + fbcdn + other host

    await openSettings(page);
    await panel(page).getByRole('switch', { name: /exclude base64 images/i }).click();
    await save(page).click();
    await expect(panel(page)).toHaveCount(0); // Save closes the panel

    await page.getByRole('button', { name: 'Rescan page' }).click();
    await expectItemCount(page, 2);
  });

  test('Cancel discards the draft (nothing persists)', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);
    await panel(page).getByRole('switch', { name: /exclude emoji/i }).click();
    await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
    expect((await stored(context)).excludeEmoji).toBeUndefined();
  });

  test('Escape discards the draft (nothing persists)', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);
    await panel(page).getByRole('switch', { name: /resolve exact originals/i }).click();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    expect((await stored(context)).resolveOriginals).toBeUndefined();
  });

  test('"Notify when downloads finish" stays off when the permission is denied', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);
    // Toggling it on requests the optional notifications permission; with no user
    // to grant it (headless), the switch must not flip on.
    const notify = panel(page).getByRole('switch', { name: /notify when downloads finish/i });
    await notify.click();
    await expect(notify).toHaveAttribute('aria-checked', 'false');
  });

  test('Export backup confirms it exported', async ({ context }) => {
    const page = await openBubblePage(context, '/media.html');
    await openPanel(page);
    await openSettings(page);

    // The export routes the JSON through the background's chrome.downloads (not a
    // page-context download), so assert the in-panel confirmation instead.
    await panel(page).getByRole('button', { name: /export backup/i }).click();
    await expect(panel(page).getByText(/backup exported/i)).toBeVisible();
  });
});
