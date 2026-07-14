import { describe, it, expect, vi, afterEach } from 'vitest';
import { photoTargetsFromDom, isOffPhotoRoute, runCaptureOnLoadedTiles, startOriginalCapture } from '@/extension/content/originalCaptureRunner';
import { ingestSniffedFbMedia, __resetFbResolver } from '@mbd/core/resolvers/sites/facebook';

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

describe('startOriginalCapture (scroll restore)', () => {
  const originalScrollTo = window.scrollTo;
  const originalScrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');

  afterEach(() => {
    window.scrollTo = originalScrollTo;
    if (originalScrollYDescriptor) {
      Object.defineProperty(window, 'scrollY', originalScrollYDescriptor);
    }
  });

  it('restores the pre-scroll position, not the post-scroll-to-load position', async () => {
    // jsdom's real window.scrollTo does not update window.scrollY, so simulate
    // a real browser where scrolling actually moves scrollY.
    let y = 50;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    window.scrollTo = ((_x: number, ny: number) => { y = ny; }) as typeof window.scrollTo;

    // Empty grid: enumerate() returns [] so the capture loop is a no-op, and
    // scrollToLoadAll's scrollHeight stays flat (0 in jsdom) after one 800ms
    // poll, so it exits quickly with the small maxMs below.
    document.body.innerHTML = '';

    await startOriginalCapture(() => {}, new AbortController().signal, { maxPhotos: 5, maxMs: 10 });

    // With the bug, startY is sampled after scrollToLoadAll already scrolled
    // to document.scrollHeight (0 in jsdom), so restore() would leave y at 0.
    // Fixed, startY is sampled before any scrolling, so restore() brings us
    // back to the original 50.
    expect(window.scrollY).toBe(50);
  });
});
