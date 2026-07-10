import { test, expect } from '../fixtures/extension';
import { openBubblePage, openPanel, itemCount, expectItemCount } from '../helpers/bubble';
import type { Page } from '@playwright/test';

const figureWithSrc = (page: Page, part: string) =>
  page.locator('figure', { has: page.locator(`img[src*="${part}"]`) });
const previewModal = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

async function excludeHost(page: Page, item: ReturnType<Page['locator']>): Promise<void> {
  await item.getByRole('button', { name: 'View Details' }).click();
  await expect(previewModal(page)).toBeVisible();
  await page.getByRole('button', { name: 'Exclude source' }).click();
  await page.getByRole('menuitem', { name: /exclude site/i }).click();
}

test.describe('realistic sites', () => {
  test('X/Twitter: collapses photo sizes, surfaces native-video + gif as Video items, excludes the pbs host', async ({ context }) => {
    const page = await openBubblePage(context, '/twitter.html');
    await openPanel(page);
    // og + PhotoA (two name= sizes → one) + PhotoB + native video + gif + avatar + card = 7.
    expect(await itemCount(page)).toBe(7);
    await expect(figureWithSrc(page, 'GAAA111PhotoAA')).toHaveCount(1); // size variants collapsed

    // The native-video poster (/ext_tw_video_thumb/) and the gif (/tweet_video_thumb/)
    // are both Video-kind items.
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'ext_tw_video_thumb')).toHaveCount(1);
    await expect(figureWithSrc(page, 'tweet_video_thumb')).toHaveCount(1);
  });

  test('Instagram: upgrades the thumbnail to the hydration-JSON original + reel poster', async ({ context }) => {
    const page = await openBubblePage(context, '/instagram.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(2);
    // The resolver read image_versions2 and surfaced the 1080 candidate, not the
    // on-page thumbnail; the reel (media_type 2) surfaces its poster.
    await expect(figureWithSrc(page, 'IG_A_1080')).toHaveCount(1);
    await expect(figureWithSrc(page, 'IG_REEL_POSTER')).toHaveCount(1);
    await expect(figureWithSrc(page, 'IG_A_THUMB')).toHaveCount(0); // thumb was upgraded away
  });

  test('Instagram: the reel is a Video-kind item (kind filter)', async ({ context }) => {
    const page = await openBubblePage(context, '/instagram.html');
    await openPanel(page);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'IG_REEL_POSTER')).toHaveCount(1);
  });

  test('Instagram: favourite the post and see it in the Favourites panel', async ({ context }) => {
    const page = await openBubblePage(context, '/instagram.html');
    await openPanel(page);
    await figureWithSrc(page, 'IG_A_1080').getByRole('button', { name: /add favourite/i }).click();
    await page.getByRole('button', { name: 'Favourites' }).click();
    await expect(page.getByRole('dialog', { name: /favourites/i }).getByRole('button', { name: /^remove$/i })).toHaveCount(1);
  });

  test('Facebook: collapses the same photo across edge PoPs + signed queries', async ({ context }) => {
    const page = await openBubblePage(context, '/facebook.html');
    await openPanel(page);
    // Photo 1 (two edge hosts) collapses to one; photo 2 is one → 2 items total.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'FB_PHOTO_1_n')).toHaveCount(1);
    await expect(figureWithSrc(page, 'FB_PHOTO_2_n')).toHaveCount(1);

    // Excluding the fbcdn site removes both photos at once.
    await excludeHost(page, figureWithSrc(page, 'FB_PHOTO_2_n'));
    await expect(figureWithSrc(page, 'FB_PHOTO_2_n')).toHaveCount(0);
    await expectItemCount(page, 0);
  });

  test('Generic web: collects srcset / picture / lazy / background / og / gallery media', async ({ context }) => {
    const page = await openBubblePage(context, '/web.html');
    await openPanel(page);
    // A rich mix of patterns — assert the distinctive ones were each collected.
    await expect(figureWithSrc(page, 'og-hero')).toHaveCount(1);         // og:image meta
    await expect(figureWithSrc(page, 'large.jpg')).toHaveCount(1);       // srcset 1600w winner
    await expect(figureWithSrc(page, 'pic-2x.webp')).toHaveCount(1);     // <picture> source
    await expect(figureWithSrc(page, 'lazy-original')).toHaveCount(1);   // data-src lazy
    await expect(figureWithSrc(page, 'backdrop')).toHaveCount(1);        // CSS background-image
    await expect(figureWithSrc(page, '120px-Example')).toHaveCount(1);   // wikipedia thumb (item)
    await expect(figureWithSrc(page, 'shirt_400x400')).toHaveCount(1);   // shopify product
    await expect(figureWithSrc(page, 'redd.it')).not.toHaveCount(0);     // gallery link
    expect(await itemCount(page)).toBeGreaterThanOrEqual(8);
  });

  test('Pinterest: collapses /<size>/ variants to one original + surfaces the video pin, then excludes the pinimg host', async ({ context }) => {
    const page = await openBubblePage(context, '/pinterest.html');
    await openPanel(page);
    // og original + pin A (236/474/736 → one) + pin B (564/736 → one) + video pin = 4.
    expect(await itemCount(page)).toBe(4);
    await expect(figureWithSrc(page, '45791643dd397b203c0306f076d94e0b')).toHaveCount(1); // 3 sizes collapsed
    await expect(figureWithSrc(page, 'BBBB1111222233334444555566667777')).toHaveCount(1); // 2 sizes collapsed

    // The video pin (poster + <video> in its cell) is a Video-kind pending item.
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, '62b7a5ecc1b483e99a3456ef9c2f7861')).toHaveCount(1);

    // Every item lives on i.pinimg.com → excluding the site clears the grid.
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await excludeHost(page, figureWithSrc(page, '45791643dd397b203c0306f076d94e0b'));
    await expectItemCount(page, 0);
  });

  test('Reddit: collapses preview.redd.it renditions to the i.redd.it original; leaves external-preview alone', async ({ context }) => {
    const page = await openBubblePage(context, '/reddit.html');
    await openPanel(page);
    // preview (640 + 960 → one i.redd.it) + direct i.redd.it + external-preview = 3.
    expect(await itemCount(page)).toBe(3);
    await expect(figureWithSrc(page, 'ch5ejccb04ch1')).toHaveCount(1);       // two renditions collapsed
    await expect(figureWithSrc(page, 'abcd1234efgh5678')).toHaveCount(1);    // direct original
    await expect(figureWithSrc(page, 'external-preview.redd.it')).toHaveCount(1); // NOT rewritten
  });

  test('Flickr: collapses sub-_b sizes to _b, keeps the different-secret _6k, passes the buddyicon through', async ({ context }) => {
    const page = await openBubblePage(context, '/flickr.html');
    await openPanel(page);
    // photo (_n/_z/_b → one _b) + the _6k original + the buddyicon = 3.
    expect(await itemCount(page)).toBe(3);
    await expect(figureWithSrc(page, '55379291849')).toHaveCount(1);   // three sizes collapsed
    await expect(figureWithSrc(page, '99887766554_3d3e638f8b_6k')).toHaveCount(1); // large kept as-is
    await expect(figureWithSrc(page, 'buddyicon')).toHaveCount(1);     // non-photo asset survives
  });

  test('ArtStation: collapses /small/ + /medium/ to /large/ and surfaces the video-clip poster as a Video item', async ({ context }) => {
    const page = await openBubblePage(context, '/artstation.html');
    await openPanel(page);
    // asset A (small + medium → one /large/) + direct /large/ B + video-clip poster = 3.
    expect(await itemCount(page)).toBe(3);
    await expect(figureWithSrc(page, 'ed-pantera-ts01')).toHaveCount(1); // two buckets collapsed
    await expect(figureWithSrc(page, 'ed-pantera-sheet')).toHaveCount(1);

    // The clip artwork (poster + embed iframe in its cell) is a Video-kind pending item.
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'marathon-poster')).toHaveCount(1);
  });

  test('Unsplash: strips imgix params from the unsigned image; leaves the signed Unsplash+ URL intact', async ({ context }) => {
    const page = await openBubblePage(context, '/unsplash.html');
    await openPanel(page);
    // unsigned images.unsplash.com (params stripped) + signed plus.unsplash.com (untouched) = 2.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'photo-EEUNSPLASHAAA')).toHaveCount(1);
    await expect(figureWithSrc(page, 'premium_photo-EEUNSPLASHBBB')).toHaveCount(1);
  });

  test('Wallhaven: rewrites the th thumb to the full-resolution file (jpg vs badged png)', async ({ context }) => {
    const page = await openBubblePage(context, '/wallhaven.html');
    await openPanel(page);
    // one unbadged jpg wallpaper + one span.png-badged png wallpaper = 2.
    expect(await itemCount(page)).toBe(2);
    // The fixture keeps its media in <figure> (the resolver reads the figure's
    // png/gif badge, resolution label, and preview link), so match on the grid's
    // /lg/ thumbnail — the page's own <img> serves /small/, never /lg/.
    await expect(figureWithSrc(page, 'lg/ee/ee9k7d')).toHaveCount(1);
    await expect(figureWithSrc(page, 'lg/ab/ab3x2m')).toHaveCount(1);
  });

  test('Behance: upgrades the /disp/ render to the max-size /source/ original', async ({ context }) => {
    const page = await openBubblePage(context, '/behance.html');
    await openPanel(page);
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'behanceEE01a1b2c3')).toHaveCount(1);
  });

  test('Bluesky: upgrades feed_thumbnail to feed_fullsize; the video post is a Video-kind item', async ({ context }) => {
    const page = await openBubblePage(context, '/bsky.html');
    await openPanel(page);
    // feed photo (thumbnail → fullsize) + video post (feed_video_blob poster) = 2.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'bafkreieebimgcidAAA')).toHaveCount(1);

    // The video post surfaces its poster as a pending Video-kind item.
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'bafkreieebvidcidBBB')).toHaveCount(1);
  });

  test('Arc XP: collapses the resizer width variants to the widest, preserving the auth token', async ({ context }) => {
    const page = await openBubblePage(context, '/arcxp.html');
    await openPanel(page);
    // 480w / 960w / 1920w of one photo (shared auth) collapse to the single widest.
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'EEARC5SOURCEID7')).toHaveCount(1);
  });

  test('Magnific: collapses the signed width variants to the widest, keeping the token', async ({ context }) => {
    const page = await openBubblePage(context, '/magnific.html');
    await openPanel(page);
    // 360w / 740w / 2000w of one photo collapse to the single widest signed variant.
    expect(await itemCount(page)).toBe(1);
    await expect(figureWithSrc(page, 'eemag7photoID3')).toHaveCount(1);
  });

  test('YouTube: turns an <iframe> embed and a bare watch link into public poster images', async ({ context }) => {
    const page = await openBubblePage(context, '/youtube.html');
    await openPanel(page);
    // embed iframe (id 1) + watch anchor (id 2) → two i.ytimg posters = 2.
    expect(await itemCount(page)).toBe(2);
    await expect(figureWithSrc(page, 'EEYToneVID1')).toHaveCount(1);
    await expect(figureWithSrc(page, 'EEYTtwoVID2')).toHaveCount(1);
  });
});
