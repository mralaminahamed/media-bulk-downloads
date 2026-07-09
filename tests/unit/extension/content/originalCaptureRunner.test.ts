import { describe, it, expect, vi } from 'vitest';
import { photoTargetsFromDom, isOffPhotoRoute, runCaptureOnLoadedTiles } from '@/extension/content/originalCaptureRunner';
import { ingestSniffedFbMedia, __resetFbResolver } from '@/extension/shared/resolvers/sites/facebook';

describe('photoTargetsFromDom', () => {
  it('extracts one distinct target per fbid from photo/album anchors', () => {
    document.body.innerHTML = `
      <a href="/photo/?fbid=1000000000001&set=a"><img src="https://x.fbcdn.net/t_n.jpg"></a>
      <a href="/photo.php?fbid=1000000000002"><img src="https://x.fbcdn.net/u_n.jpg"></a>
      <a href="/photo/?fbid=1000000000001&set=b"><img src="https://x.fbcdn.net/dup_n.jpg"></a>
      <a href="/marketplace/">not a photo</a>`;
    const t = photoTargetsFromDom(document);
    expect(t.map((x) => x.fbid).sort()).toEqual(['1000000000001', '1000000000002']);
  });

  it('open() clicks the anchor', () => {
    document.body.innerHTML = `<a href="/photo/?fbid=1000000000009"><img></a>`;
    const a = document.querySelector('a')!;
    const click = vi.fn();
    a.click = click;
    photoTargetsFromDom(document)[0].open();
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('isOffPhotoRoute', () => {
  it('is false on a photo route, true on the grid', () => {
    expect(isOffPhotoRoute('/photo.php?fbid=123')).toBe(false);
    expect(isOffPhotoRoute('/photo/?fbid=123&set=a')).toBe(false);
    expect(isOffPhotoRoute('/profile.php?id=61563550864295&sk=photos')).toBe(true);
  });
});

describe('runCaptureOnLoadedTiles (integration over real deps)', () => {
  it('captures a photo once opening ingests its original', async () => {
    __resetFbResolver();
    document.body.innerHTML = `<a href="/photo/?fbid=1000000000001"><img src="https://x.fbcdn.net/t_n.jpg"></a>`;
    const a = document.querySelector('a')!;
    // "Opening" the photo ingests a >=1024 original for that fbid (what the real
    // MAIN sniffer does on the viewer request).
    a.click = () => ingestSniffedFbMedia([{ fbid: '1000000000001', kind: 'image', url: 'https://x.fbcdn.net/o_n.jpg', ext: 'jpg', width: 2048, height: 1536 }]);
    const r = await runCaptureOnLoadedTiles(() => {}, new AbortController().signal, { maxPhotos: 5, maxMs: 60000 });
    expect(r.captured).toBe(1);
    expect(r.opened).toBe(1);
  });
});
