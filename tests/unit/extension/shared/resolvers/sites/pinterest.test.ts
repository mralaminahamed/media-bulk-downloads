import { pinterestResolver, ingestSniffedPinterestMedia, pinterestPageMedia, __resetPinterestSniffed } from '@/extension/shared/resolvers/sites/pinterest';
import { ResolveContext } from '@/extension/shared/resolvers/types';

// Real image hash + size folders captured from a live pin (2026-07-09): one image
// served at many /<size>/ folders plus /originals/.
const HASH = '45/79/16/45791643dd397b203c0306f076d94e0b.jpg';
const img = (folder: string) => `https://i.pinimg.com/${folder}/${HASH}`;
const ORIGINALS = img('originals');

const resolve = (href: string, ctx: ResolveContext = { allowNetwork: false }) =>
  pinterestResolver.resolve(new URL(href), ctx);

/** Build a poster <img> inside a pin cell, optionally with a video marker. */
function poster({ href, marker }: { href?: string; marker?: 'video' | 'testid' | 'aria' } = {}): Element {
  const cell = document.createElement('div');
  cell.setAttribute('data-test-id', 'pin');
  const inner = href ? (() => { const a = document.createElement('a'); a.setAttribute('href', href); cell.appendChild(a); return a; })() : cell;
  const im = document.createElement('img');
  inner.appendChild(im);
  if (marker === 'video') inner.appendChild(document.createElement('video'));
  if (marker === 'testid') { const d = document.createElement('div'); d.setAttribute('data-test-id', 'PinTypeIdentifier-video'); inner.appendChild(d); }
  if (marker === 'aria') { const d = document.createElement('div'); d.setAttribute('aria-label', 'This Pin is a video'); inner.appendChild(d); }
  return im;
}

describe('pinterestResolver — match', () => {
  it('matches i.pinimg.com and nothing else', () => {
    const ctx = { allowNetwork: false };
    expect(pinterestResolver.match(new URL(img('564x')), ctx)).toBe(true);
    // Direct video hosts are handled by the <video> collection pass, not here.
    expect(pinterestResolver.match(new URL('https://v1.pinimg.com/videos/iht/720p/x.mp4'), ctx)).toBe(false);
    expect(pinterestResolver.match(new URL('https://www.pinterest.com/pin/123/'), ctx)).toBe(false);
    expect(pinterestResolver.match(new URL('https://example.com/x.jpg'), ctx)).toBe(false);
  });
});

describe('pinterestResolver — images', () => {
  it.each(['236x', '474x', '564x', '736x', '600x315', '136x136', '60x60'])(
    'upgrades size folder %s -> originals', (folder) => {
      const [c] = resolve(img(folder));
      expect(c).toMatchObject({ kind: 'image', url: ORIGINALS });
      expect(c.thumbnailSrc).toBe(img(folder));
    },
  );

  it('leaves an already-originals URL unchanged, with no thumbnailSrc', () => {
    const [c] = resolve(ORIGINALS);
    expect(c.url).toBe(ORIGINALS);
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it.each(['30x30_RS', '75x75_RS', '140x140_RS', '280x280_RS'])(
    'upgrades the responsive smart-crop folder %s -> originals', (folder) => {
      // `_RS` folders (board covers, avatars, section covers) share the same hash
      // path as the full image, so /originals/ resolves for them too (verified
      // HTTP 200 against a real board). Upgrade them like any other size folder.
      const [c] = resolve(img(folder));
      expect(c).toMatchObject({ kind: 'image', url: ORIGINALS });
      expect(c.thumbnailSrc).toBe(img(folder));
    },
  );

  it('carries the real file extension', () => {
    expect(resolve(img('736x'))[0].ext).toBe('jpg');
  });

  it('does NOT attach a resolveHint to a plain still image (no network needed for /originals/)', () => {
    expect(resolve(img('564x'))[0].resolveHint).toBeUndefined();
  });
});

describe('pinterestResolver — video pins', () => {
  it('a poster with a <video> in its cell + a pin-link id -> pending video with a pinterest hint', () => {
    const [c] = resolve(img('736x'), { allowNetwork: false, el: poster({ href: '/pin/84301824269690044/', marker: 'video' }) });
    expect(c).toMatchObject({
      kind: 'video',
      unresolvedVideo: true,
      poster: img('736x'),
      resolveHint: { platform: 'pinterest', id: '84301824269690044' },
    });
    // Never surfaces the still as the downloadable media.
    expect(c.url).toBe(img('736x'));
  });

  it('recovers the pin id from a slug--id permalink', () => {
    const [c] = resolve(img('736x'), { allowNetwork: false, el: poster({ href: '/pin/recipe-video--454933999867625815/', marker: 'video' }) });
    expect(c.resolveHint).toEqual({ platform: 'pinterest', id: '454933999867625815' });
  });

  it('recovers the pin id from the page URL when no pin link wraps the poster', () => {
    const el = poster({ marker: 'testid' });
    const [c] = resolve(img('736x'), { allowNetwork: false, el, pageUrl: 'https://www.pinterest.com/pin/84301824269690044/' });
    expect(c.kind).toBe('video');
    expect(c.resolveHint).toEqual({ platform: 'pinterest', id: '84301824269690044' });
  });

  it('accepts an aria-label video signal', () => {
    const [c] = resolve(img('736x'), { allowNetwork: false, el: poster({ href: '/pin/999/', marker: 'aria' }) });
    expect(c.kind).toBe('video');
    expect(c.resolveHint).toEqual({ platform: 'pinterest', id: '999' });
  });

  it('falls back to an image when a video signal is present but no pin id is recoverable', () => {
    const [c] = resolve(img('564x'), { allowNetwork: false, el: poster({ marker: 'video' }) });
    expect(c.kind).toBe('image');
    expect(c.url).toBe(ORIGINALS);
  });

  it('does NOT treat a still pin (no video signal) as a video, even inside a /pin/ link', () => {
    const [c] = resolve(img('564x'), { allowNetwork: false, el: poster({ href: '/pin/84301824269690044/' }) });
    expect(c.kind).toBe('image');
    expect(c.url).toBe(ORIGINALS);
    expect(c.resolveHint).toBeUndefined();
  });
});

describe('pinterestResolver — edge cases', () => {
  it('does not crash and returns an image when ctx.el is absent', () => {
    const [c] = resolve(img('736x')); // no el in ctx
    expect(c).toMatchObject({ kind: 'image', url: ORIGINALS });
  });

  it('treats a /videos/thumbnails/ video-poster path as a plain image (no size-folder rule applies)', () => {
    const vt = 'https://i.pinimg.com/videos/thumbnails/originals/62/b7/a5/62b7a5ecc1b483e99a3456ef9c2f7861.0000000.jpg';
    const [c] = resolve(vt);
    expect(c.kind).toBe('image');
    expect(c.url).toBe(vt);
  });

  it('extracts the pin id even when the /pin/ link carries a trailing query', () => {
    const cell = document.createElement('div');
    cell.innerHTML = '<a href="/pin/84301824269690044/?utm_source=x"><img alt="p"><video></video></a>';
    const [c] = resolve(img('736x'), { allowNetwork: false, el: cell.querySelector('img')! });
    expect(c.resolveHint).toEqual({ platform: 'pinterest', id: '84301824269690044' });
  });

  it('detects a <video> elsewhere in the pin cell, not only inside the anchor', () => {
    const cell = document.createElement('div');
    cell.setAttribute('data-test-id', 'pin');
    cell.innerHTML = '<a href="/pin/555/"><img alt="p"></a><div class="overlay"><video></video></div>';
    const [c] = resolve(img('736x'), { allowNetwork: false, el: cell.querySelector('img')! });
    expect(c).toMatchObject({ kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'pinterest', id: '555' } });
  });

  it('ignores a /pin/ link that has no numeric id (nothing to resolve)', () => {
    const cell = document.createElement('div');
    cell.innerHTML = '<a href="/pin/create/"><img alt="p"><video></video></a>';
    const [c] = resolve(img('564x'), { allowNetwork: false, el: cell.querySelector('img')! });
    expect(c.kind).toBe('image'); // no id → falls back to the image
    expect(c.url).toBe(ORIGINALS);
  });
});

describe('pinterestResolver — sniffed store', () => {
  beforeEach(() => __resetPinterestSniffed());

  const imgEntry = { pinId: '698058011039781102', kind: 'image', url: 'https://i.pinimg.com/originals/aa/bb/cc.jpg', ext: 'jpg', width: 1000, height: 1500 };

  it('ingest host-pins and pinterestPageMedia returns the pin media for a /pin/ url', () => {
    ingestSniffedPinterestMedia([imgEntry, { pinId: '9', kind: 'image', url: 'https://evil.com/x.jpg', ext: 'jpg' }]);
    const media = pinterestPageMedia('https://www.pinterest.com/pin/698058011039781102/');
    expect(media).toEqual([{ url: 'https://i.pinimg.com/originals/aa/bb/cc.jpg', kind: 'image', ext: 'jpg', width: 1000, height: 1500 }]);
  });

  it('pinterestPageMedia returns [] off a pin page and for an unknown pin', () => {
    ingestSniffedPinterestMedia([imgEntry]);
    expect(pinterestPageMedia('https://www.pinterest.com/someuser/')).toEqual([]);
    expect(pinterestPageMedia('https://www.pinterest.com/pin/000000000000/')).toEqual([]);
  });

  it('a DOM tile whose /pin/ link matches a sniffed pin resolves to the sniffed orig', () => {
    ingestSniffedPinterestMedia([imgEntry]);
    const a = document.createElement('a');
    a.setAttribute('href', '/pin/698058011039781102/');
    const im = document.createElement('img');
    a.appendChild(im);
    const [c] = pinterestResolver.resolve(new URL('https://i.pinimg.com/236x/zz/zz/zz.jpg'), { el: im, allowNetwork: false });
    expect(c).toMatchObject({ url: 'https://i.pinimg.com/originals/aa/bb/cc.jpg', kind: 'image' });
  });

  it('a video pin resolves to the sniffed mp4 with poster (no network)', () => {
    ingestSniffedPinterestMedia([{ pinId: '698058011039781102', kind: 'video', url: 'https://v1.pinimg.com/videos/720p/x.mp4', ext: 'mp4', poster: 'https://i.pinimg.com/originals/aa/bb/cc.jpg' }]);
    const [c] = pinterestPageMedia('https://www.pinterest.com/pin/698058011039781102/');
    expect(c).toMatchObject({ kind: 'video', url: 'https://v1.pinimg.com/videos/720p/x.mp4', poster: 'https://i.pinimg.com/originals/aa/bb/cc.jpg' });
  });

  it('a tile with no sniffed match still upgrades via the existing /originals/ path', () => {
    const [c] = pinterestResolver.resolve(new URL('https://i.pinimg.com/236x/zz/zz/zz.jpg'), { allowNetwork: false });
    expect(c.url).toBe('https://i.pinimg.com/originals/zz/zz/zz.jpg');
  });
});
