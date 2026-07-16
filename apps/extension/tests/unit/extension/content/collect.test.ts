import type { Mock } from 'vitest';
// `sniffedHlsManifests` is wrapped in a vi.fn so the DASH sniffed-case test can
// override its return value for one call (a real .mpd can never reach the actual
// store — ingestSniffedHls only accepts .m3u8, see hls-sniff.ts). Every other test
// keeps the real behavior: ingestSniffedHls/resetSniffedHls are spread through
// untouched, and the default implementation just delegates to the actual function.
vi.mock('@mbd/core/resolvers/sniffers/hls-sniff', async () => {
  const actual = await vi.importActual<typeof import('@mbd/core/resolvers/sniffers/hls-sniff')>('@mbd/core/resolvers/sniffers/hls-sniff');
  return { __esModule: true, ...actual, sniffedHlsManifests: vi.fn(actual.sniffedHlsManifests) };
});

import { collectMedia, backgroundImageUrls } from '@/extension/content/collect';
import { ingestSniffedHls, resetSniffedHls, sniffedHlsManifests } from '@mbd/core/resolvers/sniffers/hls-sniff';
import { HOST_ID } from '@/extension/bubble/mount';

const setBody = (html: string) => {
  document.body.innerHTML = html;
};

describe('collectMedia — original upgrade', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('upgrades a Twitter URL, keeps the small variant as thumbnailSrc, and parses type', () => {
    setBody('<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=360x360" alt="t">');
    const [img] = collectMedia();
    expect(img.src).toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
    expect(img.thumbnailSrc).toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=360x360');
    expect(img.type).toBe('jpeg');
  });

  it('carries the resolver-supplied file extension onto the collected item', () => {
    setBody('<img src="https://ex.com/photo.jpg">');
    const [img] = collectMedia();
    expect(img.ext).toBe('jpg'); // generic resolver keeps the real .jpg, not the canonical 'jpeg' type
  });

  it('leaves ext undefined when no resolver reports one', () => {
    setBody('<img src="https://ex.com/render?id=1">');
    const [img] = collectMedia();
    expect(img.ext).toBeUndefined();
  });

  it('collapses two size variants of the same media to one original entry', () => {
    setBody(
      '<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=360x360">' +
        '<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=900x900">',
    );
    const originals = collectMedia().filter((i) => i.src.includes('/media/ABC'));
    expect(originals).toHaveLength(1);
    expect(originals[0].src).toContain('name=orig');
  });

  it('fills dimensions from the URL when the DOM reports 0x0', () => {
    // srcset candidates arrive with no element dimensions.
    setBody('<img srcset="https://cdn.shopify.com/s/files/1/x/y_800x600.jpg 1x">');
    const shop = collectMedia().find((i) => i.src.includes('shopify'));
    expect(shop).toBeDefined();
    expect(shop!.width).toBe(800);
    expect(shop!.height).toBe(600);
  });

  it('does not tag a data-orig-file original with the displayed thumbnail\'s dimensions', () => {
    // The rendered <img> measures 300x200 (its thumbnail); the full-res original in
    // data-orig-file is a different, larger asset — it must NOT inherit 300x200, or
    // the minimum-size filter could wrongly drop it.
    setBody('<img src="https://ex.com/thumb.jpg" data-orig-file="https://ex.com/original.jpg" width="300" height="200">');
    const media = collectMedia();
    const orig = media.find((i) => i.src === 'https://ex.com/original.jpg');
    const thumb = media.find((i) => i.src === 'https://ex.com/thumb.jpg');
    expect(orig).toBeDefined();
    expect(orig!.width).toBe(0);
    expect(orig!.height).toBe(0);
    // The displayed thumbnail keeps its real measured size.
    expect(thumb).toBeDefined();
    expect(thumb!.width).toBe(300);
    expect(thumb!.height).toBe(200);
  });
});

describe('collectMedia — kind', () => {
  it('tags <img> items as image kind', () => {
    document.body.innerHTML = `<img src="https://ex.com/a.png">`;
    const [item] = collectMedia();
    expect(item.kind).toBe('image');
  });
});

describe('collectMedia — video & audio', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('collects a <video> with poster and <source>s; the .m3u8 becomes a capturable HLS item', () => {
    document.body.innerHTML = `
      <video poster="https://ex.com/p.jpg" aria-label="Clip">
        <source src="https://ex.com/v.mp4" type="video/mp4">
        <source src="https://ex.com/live.m3u8" type="application/x-mpegURL">
      </video>`;
    const media = collectMedia();
    const vid = media.find((m) => m.src === 'https://ex.com/v.mp4');
    expect(vid).toMatchObject({ kind: 'video', type: 'mp4', poster: 'https://ex.com/p.jpg', alt: 'Clip' });
    // The HLS manifest is no longer dropped — it is surfaced as a capture item
    // (kind video, hlsManifest set) rather than a plain single-file download.
    const hls = media.find((m) => m.src === 'https://ex.com/live.m3u8');
    expect(hls).toMatchObject({ kind: 'video', type: 'm3u8', hlsManifest: 'https://ex.com/live.m3u8', poster: 'https://ex.com/p.jpg' });
  });

  it('collects <audio> sources as audio kind', () => {
    document.body.innerHTML = `<audio><source src="https://ex.com/s.mp3" type="audio/mpeg"></audio>`;
    const [a] = collectMedia().filter((m) => m.kind === 'audio');
    expect(a).toMatchObject({ kind: 'audio', type: 'mp3', src: 'https://ex.com/s.mp3' });
  });

  it('skips blob: video sources', () => {
    document.body.innerHTML = `<video src="blob:https://ex.com/abc"></video>`;
    expect(collectMedia().some((m) => m.kind === 'video')).toBe(false);
  });

  it('surfaces an <audio> HLS manifest as a capturable stream (not silently dropped)', () => {
    document.body.innerHTML = `<audio src="https://ex.com/radio/live.m3u8"></audio>`;
    const hls = collectMedia().find((m) => m.src === 'https://ex.com/radio/live.m3u8');
    expect(hls).toMatchObject({ hlsManifest: 'https://ex.com/radio/live.m3u8', type: 'm3u8' });
  });
});

describe('collectMedia — canonical dedup', () => {
  it('dedups the same image served from two rotating CDN edge hosts into one item', () => {
    document.body.innerHTML = `
      <img src="https://scontent-a.xx.fbcdn.net/v/t1/photo_n.jpg?oh=A&oe=1">
      <img src="https://scontent-b.xx.fbcdn.net/v/t1/photo_n.jpg?oh=B&oe=2">`;
    const fb = collectMedia().filter((m) => m.src.includes('/v/t1/photo_n.jpg'));
    expect(fb).toHaveLength(1);
  });
});

describe('collectMedia — HLS streams', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const hls = (m: { src: string }[]) => m.filter((i) => (i as { hlsManifest?: string }).hlsManifest);

  it('surfaces a native <video src=.m3u8> as a capture item', () => {
    setBody('<video src="https://cdn.com/master.m3u8" poster="https://cdn.com/p.jpg"></video>');
    const [item] = hls(collectMedia());
    expect(item).toMatchObject({ kind: 'video', type: 'm3u8', hlsManifest: 'https://cdn.com/master.m3u8', poster: 'https://cdn.com/p.jpg' });
  });

  it('surfaces a direct <a href=.m3u8> link as a capture item', () => {
    setBody('<a href="https://cdn.com/live/index.m3u8">watch live</a>');
    expect(hls(collectMedia()).map((i) => (i as { hlsManifest?: string }).hlsManifest)).toEqual(['https://cdn.com/live/index.m3u8']);
  });

  it('keeps a query string on the manifest URL', () => {
    setBody('<video src="https://cdn.com/master.m3u8?token=abc"></video>');
    expect(hls(collectMedia())[0]).toMatchObject({ hlsManifest: 'https://cdn.com/master.m3u8?token=abc' });
  });

  it('dedupes the same manifest seen as both a <source> and a link', () => {
    setBody(
      '<video><source src="https://cdn.com/m.m3u8" type="application/x-mpegURL"></video>' +
      '<a href="https://cdn.com/m.m3u8">same</a>',
    );
    expect(hls(collectMedia())).toHaveLength(1);
  });

  it('still drops blob: (a .mpd link is now captured — see DASH streams below)', () => {
    setBody('<video src="blob:https://ex.com/x"></video>');
    expect(hls(collectMedia())).toHaveLength(0);
  });

  it('surfaces a sniffer-caught manifest (hls.js — not in the DOM)', () => {
    resetSniffedHls();
    ingestSniffedHls(['https://cdn.com/sniffed/master.m3u8']);
    const [item] = hls(collectMedia());
    expect(item).toMatchObject({ kind: 'video', hlsManifest: 'https://cdn.com/sniffed/master.m3u8' });
    resetSniffedHls();
  });

  it('dedupes a manifest present in both the DOM and the sniffer store', () => {
    resetSniffedHls();
    setBody('<video src="https://cdn.com/dup.m3u8"></video>');
    ingestSniffedHls(['https://cdn.com/dup.m3u8']);
    expect(hls(collectMedia())).toHaveLength(1);
    resetSniffedHls();
  });
});

describe('collectMedia — DASH streams', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('surfaces a .mpd <video> as a DASH capture item', () => {
    document.body.innerHTML = '<video src="https://cdn.com/movie.mpd" poster="https://cdn.com/p.jpg"></video>';
    const item = collectMedia().find((i) => (i as { hlsManifest?: string }).hlsManifest === 'https://cdn.com/movie.mpd');
    expect(item).toMatchObject({ kind: 'video', type: 'mpd', hlsManifest: 'https://cdn.com/movie.mpd' });
  });

  it('surfaces a direct <a href=.mpd> link as a DASH capture item', () => {
    setBody('<a href="https://cdn.com/dash/manifest.mpd">watch</a>');
    const item = collectMedia().find((i) => (i as { hlsManifest?: string }).hlsManifest === 'https://cdn.com/dash/manifest.mpd');
    expect(item).toMatchObject({ kind: 'video', type: 'mpd', hlsManifest: 'https://cdn.com/dash/manifest.mpd' });
  });

  it('surfaces a sniffer-caught .mpd manifest as a DASH capture item', () => {
    (sniffedHlsManifests as Mock).mockReturnValueOnce(['https://cdn.com/sniffed/movie.mpd']);
    const item = collectMedia().find((i) => (i as { hlsManifest?: string }).hlsManifest === 'https://cdn.com/sniffed/movie.mpd');
    expect(item).toMatchObject({ kind: 'video', type: 'mpd', hlsManifest: 'https://cdn.com/sniffed/movie.mpd' });
  });
});

describe('collectMedia — deep extraction', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('collects a lazy data-src image', () => {
    document.body.innerHTML = `<img src="placeholder.gif" data-src="https://cdn.com/real.jpg">`;
    expect(collectMedia().some((m) => m.src === 'https://cdn.com/real.jpg')).toBe(true);
  });

  it('collects a gallery full-res link with the thumbnail attached', () => {
    document.body.innerHTML = `<a href="https://cdn.com/full.jpg"><img src="https://cdn.com/thumb.jpg"></a>`;
    const item = collectMedia().find((m) => m.src === 'https://cdn.com/full.jpg');
    expect(item?.thumbnailSrc).toBe('https://cdn.com/thumb.jpg');
  });

  it('collects an image hidden in <noscript>', () => {
    document.body.innerHTML = `<noscript>&lt;img src="https://cdn.com/ns.png"&gt;</noscript>`;
    expect(collectMedia().some((m) => m.src === 'https://cdn.com/ns.png')).toBe(true);
  });
});

describe('collectMedia — native resolvers', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('upgrades a Twitter media image to name=orig', () => {
    document.body.innerHTML = `<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=small">`;
    expect(collectMedia().some((m) => m.src === 'https://pbs.twimg.com/media/ABC?format=jpg&name=orig')).toBe(true);
  });

  it('emits a pending video for a Twitter video poster <img> in the media grid', () => {
    document.body.innerHTML =
      `<a href="/u/status/1799"><img src="https://pbs.twimg.com/ext_tw_video_thumb/2040/pu/img/x.jpg"></a>`;
    const vid = collectMedia().find((m) => m.resolveHint?.platform === 'twitter');
    expect(vid).toMatchObject({ kind: 'video', unresolvedVideo: true, resolveHint: { id: '1799' } });
  });

  it('does not leak the poster as an image when it is also a background-image', () => {
    // X renders a video poster as BOTH an <img> and a sibling background-image.
    document.body.innerHTML =
      `<a href="/u/status/2067/video/1">` +
      `<div style="background-image:url('https://pbs.twimg.com/amplify_video_thumb/2067/img/y.jpg?format=jpg&name=360x360')"></div>` +
      `<img src="https://pbs.twimg.com/amplify_video_thumb/2067/img/y.jpg?format=jpg&name=360x360">` +
      `</a>`;
    const media = collectMedia();
    const videos = media.filter((m) => m.kind === 'video');
    const posterImages = media.filter((m) => m.kind === 'image' && /amplify_video_thumb/.test(m.src));
    expect(videos).toHaveLength(1); // one video (deduped across img + background)
    expect(videos[0]).toMatchObject({ resolveHint: { platform: 'twitter', id: '2067' }, unresolvedVideo: true });
    expect(posterImages).toHaveLength(0); // NO poster leaked as an image
  });

  it('collects an extensionless GIF grid thumb as a video, never leaking it as a still', () => {
    // On the media grid the GIF thumb is an <img> at /tweet_video_thumb/<ID> with
    // the format only in the query string (no path extension).
    document.body.innerHTML =
      `<a href="/u/status/42"><img src="https://pbs.twimg.com/tweet_video_thumb/HJ_SQ1hWIAAcv77?format=jpg&name=small"></a>`;
    const media = collectMedia();
    expect(media.some((m) => m.src === 'https://video.twimg.com/tweet_video/HJ_SQ1hWIAAcv77.mp4' && m.kind === 'video')).toBe(true);
    expect(media.some((m) => m.kind === 'image' && /tweet_video_thumb/.test(m.src))).toBe(false);
  });

  it('strips Unsplash resize params', () => {
    document.body.innerHTML = `<img src="https://images.unsplash.com/photo-1?w=200&q=80&fm=webp">`;
    expect(collectMedia().some((m) => m.src === 'https://images.unsplash.com/photo-1')).toBe(true);
  });

  it('resolves a Wallhaven png thumbnail via its figure badge', () => {
    document.body.innerHTML =
      `<figure data-wallpaper-id="abcdef"><img src="https://th.wallhaven.cc/small/ab/abcdef.jpg"><span class="png"></span></figure>`;
    expect(collectMedia().some((m) => m.src === 'https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png')).toBe(true);
  });

  it('emits a downloadable mp4 for a Twitter GIF video', () => {
    document.body.innerHTML =
      `<video poster="https://pbs.twimg.com/tweet_video_thumb/XYZ.jpg" src="blob:https://x.com/abc"></video>`;
    const gif = collectMedia().find((m) => m.src === 'https://video.twimg.com/tweet_video/XYZ.mp4');
    expect(gif).toMatchObject({ kind: 'video', type: 'mp4' });
  });

  it('emits an unresolved pending video for a Twitter real video', () => {
    document.body.innerHTML =
      `<article><a href="/u/status/123"></a>
       <video poster="https://pbs.twimg.com/amplify_video_thumb/9/img/y.jpg" src="blob:https://x.com/b"></video></article>`;
    const v = collectMedia().find((m) => m.resolveHint?.platform === 'twitter');
    expect(v).toMatchObject({ kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '123' } });
  });
});

describe('wallhaven true dimensions in collection', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('uses the grid resolution, not the thumbnail size, for a wallhaven wallpaper', () => {
    document.body.innerHTML = `
      <figure class="thumb" data-wallpaper-id="po7y9j">
        <img src="https://th.wallhaven.cc/small/po/po7y9j.jpg">
        <div class="thumb-info"><span class="wall-res">3840 x 2160</span><span class="png"></span></div>
      </figure>`;
    const media = collectMedia();
    const item = media.find((m) => m.src.includes('w.wallhaven.cc/full/'));
    expect(item).toBeDefined();
    expect(item).toMatchObject({ width: 3840, height: 2160 });
  });

  it('still uses URL-encoded dimensions for a non-wallhaven image (regression)', () => {
    document.body.innerHTML = `<img src="https://cdn.example.com/photo_800x600.jpg">`;
    const media = collectMedia();
    const item = media.find((m) => m.src.includes('cdn.example.com'));
    expect(item).toMatchObject({ width: 800, height: 600 });
  });
});

describe('collectMedia — background-image render guard', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('skips non-rendered elements when the document has layout, but keeps visible ones', () => {
    // jsdom reports 0×0 for everything; fake a layout so the guard activates.
    const docEl = document.documentElement;
    Object.defineProperty(docEl, 'offsetHeight', { configurable: true, value: 1000 });
    try {
      setBody(
        `<div id="vis" style="background-image:url('https://cdn.com/visible.jpg')"></div>` +
          `<div id="hid" style="background-image:url('https://cdn.com/hidden.jpg')"></div>`,
      );
      const vis = document.getElementById('vis')!;
      const hid = document.getElementById('hid')!;
      Object.defineProperty(vis, 'offsetWidth', { configurable: true, value: 200 });
      Object.defineProperty(vis, 'offsetHeight', { configurable: true, value: 100 });
      Object.defineProperty(hid, 'offsetWidth', { configurable: true, value: 0 });
      Object.defineProperty(hid, 'offsetHeight', { configurable: true, value: 0 });

      const srcs = collectMedia().map((i) => i.src);
      expect(srcs).toContain('https://cdn.com/visible.jpg');
      expect(srcs).not.toContain('https://cdn.com/hidden.jpg');
    } finally {
      // Restore no-layout so other suites keep collecting every background.
      Object.defineProperty(docEl, 'offsetHeight', { configurable: true, value: 0 });
    }
  });

  it('collects backgrounds normally when the document reports no layout (jsdom default)', () => {
    setBody(`<div style="background-image:url('https://cdn.com/bg.jpg')"></div>`);
    expect(collectMedia().map((i) => i.src)).toContain('https://cdn.com/bg.jpg');
  });
});

describe('backgroundImageUrls', () => {
  it('returns a plain url() unchanged', () => {
    expect(backgroundImageUrls('url("https://cdn.com/a.jpg")')).toEqual(['https://cdn.com/a.jpg']);
  });

  it('picks the highest-resolution image-set candidate', () => {
    const v = 'image-set(url("https://cdn.com/1x.jpg") 1x, url("https://cdn.com/2x.jpg") 2x)';
    expect(backgroundImageUrls(v)).toEqual(['https://cdn.com/2x.jpg']);
  });

  it('handles -webkit-image-set and bare-string candidates with dppx', () => {
    const v = '-webkit-image-set("https://cdn.com/lo.jpg" 1x, "https://cdn.com/hi.jpg" 3x)';
    expect(backgroundImageUrls(v)).toEqual(['https://cdn.com/hi.jpg']);
  });

  it('handles a value mixing an image-set layer and a plain url() layer', () => {
    const v = 'image-set(url("https://cdn.com/a-1x.jpg") 1x, url("https://cdn.com/a-2x.jpg") 2x), url("https://cdn.com/b.png")';
    expect(backgroundImageUrls(v)).toEqual(['https://cdn.com/a-2x.jpg', 'https://cdn.com/b.png']);
  });

  it('keeps an image-set candidate that omits its resolution descriptor', () => {
    // Per spec the descriptor defaults to 1x when absent — the candidate must not be dropped.
    expect(backgroundImageUrls('image-set(url("https://cdn.com/only.png"))')).toEqual(['https://cdn.com/only.png']);
    // Mixed: a descriptor-less candidate alongside a 2x one still yields the 2x (higher res).
    const v = 'image-set("https://cdn.com/base.jpg", "https://cdn.com/hi.jpg" 2x)';
    expect(backgroundImageUrls(v)).toEqual(['https://cdn.com/hi.jpg']);
  });

  it('ignores none / empty', () => {
    expect(backgroundImageUrls('none')).toEqual([]);
    expect(backgroundImageUrls('')).toEqual([]);
  });
});

describe('collectMedia — meta / preload hero sources', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('meta, link').forEach((n) => n.remove());
  });

  it('collects og:image and twitter:image content', () => {
    document.head.innerHTML =
      '<meta property="og:image" content="https://cdn.com/og.jpg">' +
      '<meta name="twitter:image" content="https://cdn.com/tw.jpg">';
    const srcs = collectMedia().map((i) => i.src);
    expect(srcs).toEqual(expect.arrayContaining(['https://cdn.com/og.jpg', 'https://cdn.com/tw.jpg']));
  });

  it('collects a preloaded image href and picks the best imagesrcset candidate', () => {
    document.head.innerHTML =
      '<link rel="preload" as="image" href="https://cdn.com/pre.jpg">' +
      '<link rel="preload" as="image" imagesrcset="https://cdn.com/s-320.jpg 320w, https://cdn.com/s-1600.jpg 1600w">';
    const srcs = collectMedia().map((i) => i.src);
    expect(srcs).toContain('https://cdn.com/pre.jpg');
    expect(srcs).toContain('https://cdn.com/s-1600.jpg');
  });

  it('dedupes a hero already present as an <img>', () => {
    document.head.innerHTML = '<meta property="og:image" content="https://cdn.com/hero.jpg">';
    setBody('<img src="https://cdn.com/hero.jpg">');
    expect(collectMedia().filter((i) => i.src === 'https://cdn.com/hero.jpg')).toHaveLength(1);
  });

  it('collects a direct og:video mp4 with the og:image as its poster', () => {
    document.head.innerHTML =
      '<meta property="og:image" content="https://cdn.com/poster.jpg">' +
      '<meta property="og:video" content="https://cdn.com/clip.mp4">' +
      '<meta property="og:video:type" content="video/mp4">';
    const vid = collectMedia().find((i) => i.src === 'https://cdn.com/clip.mp4');
    expect(vid).toMatchObject({ kind: 'video', type: 'mp4', poster: 'https://cdn.com/poster.jpg' });
  });

  it('reads og:video:url and og:video:secure_url too', () => {
    document.head.innerHTML = '<meta property="og:video:secure_url" content="https://cdn.com/secure.mp4">';
    expect(collectMedia().some((i) => i.src === 'https://cdn.com/secure.mp4' && i.kind === 'video')).toBe(true);
  });

  it('surfaces a streaming og:video (.m3u8) as a capturable HLS item', () => {
    document.head.innerHTML = '<meta property="og:video" content="https://cdn.com/stream.m3u8">';
    const hls = collectMedia().find((i) => i.src === 'https://cdn.com/stream.m3u8');
    expect(hls).toMatchObject({ kind: 'video', hlsManifest: 'https://cdn.com/stream.m3u8' });
  });

  it('surfaces a streaming og:video (.mpd) as a capturable DASH item', () => {
    document.head.innerHTML = '<meta property="og:video" content="https://cdn.com/movie.mpd">';
    const dash = collectMedia().find((i) => i.src === 'https://cdn.com/movie.mpd');
    expect(dash).toMatchObject({ kind: 'video', type: 'mpd', hlsManifest: 'https://cdn.com/movie.mpd' });
  });
});

describe('page-type hero reprioritisation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('meta, link').forEach((n) => n.remove());
  });

  // The brief's original example host (`?name=orig` / `?name=small`) does not
  // canonically collapse: `name` is not a recognised transform/volatile param
  // in canonical.ts's generic dynamic-path branch, so the two URLs would keep
  // distinct canonical keys and this test couldn't exercise dedup at all.
  // `w=` IS a recognised TRANSFORM_PARAM (canonical.ts), so both variants of
  // this fictitious cdn.example.com asset collapse to one canonical key
  // (`cdn.example.com/photo/abc123`) while remaining distinct literal URLs —
  // exactly what's needed to observe which representation wins first-come dedup.
  const HERO = 'https://cdn.example.com/photo/abc123?w=2000';
  const THUMB = 'https://cdn.example.com/photo/abc123?w=300'; // same canonical asset

  function singleMediaDoc() {
    document.head.innerHTML =
      `<meta property="og:type" content="article">` +
      `<meta property="og:image" content="${HERO}">`;
    document.body.innerHTML = `<img src="${THUMB}" width="1200" height="800">`;
  }

  it('keeps only one item (same canonical asset) regardless of order', () => {
    singleMediaDoc();
    const off = collectMedia(undefined, { smartPageDefaults: false });
    const on = collectMedia(undefined, { smartPageDefaults: true });
    const keys = (items: ReturnType<typeof collectMedia>) => new Set(items.map((i) => i.src.split('?')[0]));
    expect(keys(on)).toEqual(keys(off)); // distinct-asset set unchanged
    expect(on.filter((i) => i.src.split('?')[0] === 'https://cdn.example.com/photo/abc123').length).toBe(1);
  });

  it('with the flag off, today\'s DOM-first order is unchanged: the inline thumb wins', () => {
    singleMediaDoc();
    const off = collectMedia(undefined, { smartPageDefaults: false });
    const item = off.find((i) => i.src.startsWith('https://cdn.example.com/photo/abc123'));
    expect(item?.src).toBe(THUMB);
  });

  it('with the flag on, the hero (og:image) representation wins for an article/single page', () => {
    singleMediaDoc();
    const on = collectMedia(undefined, { smartPageDefaults: true });
    const item = on.find((i) => i.src.startsWith('https://cdn.example.com/photo/abc123'));
    expect(item?.src).toBe(HERO);
  });

  // Regression guard for the C4 reorder bug: bundling the meta and preload
  // passes into one closure shifted preload ahead of og:video even with the
  // flag OFF. The original (pre-hero-pass) order was DOM walk -> meta ->
  // og:video -> preload -> Instagram -> Facebook, so with the flag off the
  // og:video item must still come before a preload-sourced image item.
  it('with the flag off, og:video is collected before a link-preload image (original pass order preserved)', () => {
    document.head.innerHTML =
      '<meta property="og:video" content="https://cdn.com/clip.mp4">' +
      '<meta property="og:video:type" content="video/mp4">' +
      '<link rel="preload" as="image" href="https://cdn.com/pre.jpg">';
    const off = collectMedia(undefined, { smartPageDefaults: false });
    const videoIdx = off.findIndex((i) => i.src === 'https://cdn.com/clip.mp4');
    const preloadIdx = off.findIndex((i) => i.src === 'https://cdn.com/pre.jpg');
    expect(videoIdx).toBeGreaterThanOrEqual(0);
    expect(preloadIdx).toBeGreaterThanOrEqual(0);
    expect(videoIdx).toBeLessThan(preloadIdx);
  });
});

describe('collectMedia — same-origin iframes', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('collects media from a same-origin iframe document', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument!;
    idoc.body.innerHTML = '<img src="https://cdn.com/inframe.jpg">';
    expect(collectMedia().map((i) => i.src)).toContain('https://cdn.com/inframe.jpg');
  });

  it('skips a cross-origin iframe (contentDocument null) and still reads the top document', () => {
    setBody('<img src="https://cdn.com/top.jpg">');
    const iframe = document.createElement('iframe');
    // Cross-origin frames expose contentDocument as null.
    Object.defineProperty(iframe, 'contentDocument', { configurable: true, get() { return null; } });
    document.body.appendChild(iframe);
    let srcs: string[] = [];
    expect(() => { srcs = collectMedia().map((i) => i.src); }).not.toThrow();
    expect(srcs).toContain('https://cdn.com/top.jpg');
  });

  it('dedupes a frame image that also appears in the top document', () => {
    setBody('<img src="https://cdn.com/dup.jpg">');
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = '<img src="https://cdn.com/dup.jpg">';
    expect(collectMedia().filter((i) => i.src === 'https://cdn.com/dup.jpg')).toHaveLength(1);
  });
});

describe('collectMedia — YouTube posters', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const ID = 'dQw4w9WgXcQ';
  const HQ = `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`;

  it('turns a YouTube embed iframe into its public poster thumbnail', () => {
    setBody(`<iframe src="https://www.youtube.com/embed/${ID}?rel=0"></iframe>`);
    expect(collectMedia().map((i) => i.src)).toContain(HQ);
  });

  it('reads a lazy embed that keeps its URL in data-src', () => {
    setBody(`<iframe data-src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`);
    expect(collectMedia().map((i) => i.src)).toContain(HQ);
  });

  it('surfaces the poster for a bare text link to a video (no <img>)', () => {
    setBody(`<a href="https://youtu.be/${ID}">watch this</a>`);
    expect(collectMedia().map((i) => i.src)).toContain(HQ);
  });

  it('does not force-collect a non-YouTube iframe or an ordinary link', () => {
    setBody('<iframe src="https://maps.example.com/embed"></iframe><a href="https://ex.com/page">read</a>');
    const srcs = collectMedia().map((i) => i.src);
    expect(srcs).not.toContain('https://maps.example.com/embed');
    expect(srcs).not.toContain('https://ex.com/page');
  });

  it('dedupes an embed and a link that point at the same video', () => {
    setBody(
      `<iframe src="https://www.youtube.com/embed/${ID}"></iframe>` +
      `<a href="https://www.youtube.com/watch?v=${ID}">same video</a>`,
    );
    expect(collectMedia().filter((i) => i.src === HQ)).toHaveLength(1);
  });
});

describe('collectMedia — Vimeo videos', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const vimeo = (m: { resolveHint?: { platform: string } }[]) => m.filter((i) => i.resolveHint?.platform === 'vimeo');

  it('surfaces a Vimeo player <iframe> as a pending video with a resolve hint', () => {
    setBody('<iframe src="https://player.vimeo.com/video/76979871?autoplay=1"></iframe>');
    const [item] = vimeo(collectMedia());
    expect(item).toMatchObject({
      kind: 'video', type: 'mp4', unresolvedVideo: true,
      src: 'https://vimeo.com/76979871', resolveHint: { platform: 'vimeo', id: '76979871' },
    });
  });

  it('surfaces a Vimeo watch link', () => {
    setBody('<a href="https://vimeo.com/channels/staffpicks/76979871">watch</a>');
    expect(vimeo(collectMedia())[0]).toMatchObject({ resolveHint: { platform: 'vimeo', id: '76979871' } });
  });

  it('dedupes an embed and a link to the same video', () => {
    setBody(
      '<iframe src="https://player.vimeo.com/video/76979871"></iframe>' +
      '<a href="https://vimeo.com/76979871">same</a>',
    );
    expect(vimeo(collectMedia())).toHaveLength(1);
  });

  it('ignores a Vimeo user/channel page (no video id)', () => {
    setBody('<a href="https://vimeo.com/staffpicks">channel</a>');
    expect(vimeo(collectMedia())).toHaveLength(0);
  });
});

describe('collectMedia — gallery link to a media file', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('collects a lightbox <a href> pointing at a video FILE as video, not a .jpg image', () => {
    setBody('<a href="https://cdn.test/clip.mp4"><img src="https://cdn.test/thumb.jpg"></a>');
    const m = collectMedia();
    const clip = m.find((i) => i.src === 'https://cdn.test/clip.mp4');
    expect(clip).toMatchObject({ kind: 'video' });
    // It must NOT have been collected as an image (which would save clip.mp4 as clip.jpg).
    expect(m.filter((i) => i.src === 'https://cdn.test/clip.mp4' && i.kind === 'image')).toHaveLength(0);
  });

  it('still collects a gallery <a href> pointing at an image FILE as an image', () => {
    setBody('<a href="https://cdn.test/full.jpg"><img src="https://cdn.test/thumb.jpg"></a>');
    expect(collectMedia().find((i) => i.src === 'https://cdn.test/full.jpg')).toMatchObject({ kind: 'image' });
  });
});

describe('collectMedia — Streamable videos', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const streamable = (m: { resolveHint?: { platform: string } }[]) => m.filter((i) => i.resolveHint?.platform === 'streamable');

  it('surfaces a Streamable player <iframe> as a pending video with a resolve hint', () => {
    setBody('<iframe src="https://streamable.com/e/moo9j0"></iframe>');
    expect(streamable(collectMedia())[0]).toMatchObject({
      kind: 'video', type: 'mp4', unresolvedVideo: true,
      src: 'https://streamable.com/moo9j0', resolveHint: { platform: 'streamable', id: 'moo9j0' },
    });
  });

  it('surfaces a Streamable watch link and dedupes an embed + link to the same video', () => {
    setBody(
      '<iframe src="https://streamable.com/o/moo9j0"></iframe>' +
      '<a href="https://streamable.com/moo9j0">same</a>',
    );
    expect(streamable(collectMedia())).toHaveLength(1);
  });

  it('ignores a reserved Streamable page (no shortcode)', () => {
    setBody('<a href="https://streamable.com/login">login</a>');
    expect(streamable(collectMedia())).toHaveLength(0);
  });
});

describe('collectMedia — Rutube videos', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const rutube = (m: { resolveHint?: { platform: string } }[]) => m.filter((i) => i.resolveHint?.platform === 'rutube');

  it('surfaces a Rutube player <iframe> as a pending video with a resolve hint', () => {
    setBody(`<iframe src="https://rutube.ru/play/embed/${ID}"></iframe>`);
    expect(rutube(collectMedia())[0]).toMatchObject({
      kind: 'video', type: 'mp4', unresolvedVideo: true,
      src: `https://rutube.ru/video/${ID}/`, resolveHint: { platform: 'rutube', id: ID },
    });
  });

  it('surfaces a Rutube watch link and dedupes an embed + link to the same video', () => {
    setBody(
      `<iframe src="https://rutube.ru/play/embed/${ID}"></iframe>` +
      `<a href="https://rutube.ru/video/${ID}/">same</a>`,
    );
    expect(rutube(collectMedia())).toHaveLength(1);
  });

  it('ignores a Rutube channel page (no video id)', () => {
    setBody('<a href="https://rutube.ru/channel/12345/">channel</a>');
    expect(rutube(collectMedia())).toHaveLength(0);
  });
});

describe('collectMedia — Rumble videos', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const rumble = (m: { resolveHint?: { platform: string } }[]) => m.filter((i) => i.resolveHint?.platform === 'rumble');

  it('surfaces a Rumble watch link as a pending video (the hint carries the URL)', () => {
    setBody('<a href="https://rumble.com/v7chusk-a-title.html">watch</a>');
    expect(rumble(collectMedia())[0]).toMatchObject({
      kind: 'video', type: 'mp4', unresolvedVideo: true,
      src: 'https://rumble.com/v7chusk-a-title.html',
      resolveHint: { platform: 'rumble', id: 'https://rumble.com/v7chusk-a-title.html' },
    });
  });

  it('surfaces a Rumble player <iframe> and dedupes an embed + link to the same embed', () => {
    setBody(
      '<iframe src="https://rumble.com/embed/v7ab6sc/"></iframe>' +
      '<a href="https://rumble.com/embed/v7ab6sc">same</a>',
    );
    expect(rumble(collectMedia())).toHaveLength(1);
  });

  it('ignores a Rumble channel page (no video)', () => {
    setBody('<a href="https://rumble.com/c/somechannel">channel</a>');
    expect(rumble(collectMedia())).toHaveLength(0);
  });
});

describe('collectMedia — RedGifs videos', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const redgifs = (m: { resolveHint?: { platform: string } }[]) => m.filter((i) => i.resolveHint?.platform === 'redgifs');

  it('surfaces a RedGifs watch link as a pending video with a resolve hint', () => {
    setBody('<a href="https://www.redgifs.com/watch/brightshinyexample">clip</a>');
    expect(redgifs(collectMedia())[0]).toMatchObject({
      kind: 'video', type: 'mp4', unresolvedVideo: true,
      src: 'https://www.redgifs.com/watch/brightshinyexample',
      resolveHint: { platform: 'redgifs', id: 'brightshinyexample' },
    });
  });

  it('dedupes an /ifr/ embed and a /watch/ link to the same video', () => {
    setBody(
      '<iframe src="https://www.redgifs.com/ifr/brightshinyexample"></iframe>' +
      '<a href="https://www.redgifs.com/watch/brightshinyexample">same</a>',
    );
    expect(redgifs(collectMedia())).toHaveLength(1);
  });

  it('ignores a RedGifs listing page (no video id)', () => {
    setBody('<a href="https://www.redgifs.com/gifs/trending">trending</a>');
    expect(redgifs(collectMedia())).toHaveLength(0);
  });
});

describe('collectMedia — 9GAG posts', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const ninegag = (m: { resolveHint?: { platform: string } }[]) => m.filter((i) => i.resolveHint?.platform === '9gag');

  it('surfaces a video post (article with a <video>) as a pending video with a resolve hint', () => {
    setBody('<article><a href="https://9gag.com/gag/aOMMxxA">post</a><video><source src="https://img-9gag-fun.9cache.com/photo/aOMMxxA_460svvp9.webm"></video></article>');
    expect(ninegag(collectMedia())[0]).toMatchObject({
      kind: 'video', type: 'mp4', unresolvedVideo: true,
      src: 'https://9gag.com/gag/aOMMxxA', resolveHint: { platform: '9gag', id: 'aOMMxxA' },
    });
  });

  it('accepts 9GAG\'s jsid-post container', () => {
    setBody('<div id="jsid-post-a1b2c3d"><a href="https://9gag.com/gag/a1b2c3d">post</a><video></video></div>');
    expect(ninegag(collectMedia())).toHaveLength(1);
  });

  it('does NOT surface an image post (no <video>) — cannot 404 by construction', () => {
    setBody('<article><a href="https://9gag.com/gag/xYz1234">post</a><img src="https://img-9gag-fun.9cache.com/photo/xYz1234_700.jpg"></article>');
    expect(ninegag(collectMedia())).toHaveLength(0);
  });

  it('does NOT let an image post borrow a sibling video post\'s <video>', () => {
    setBody(
      '<article id="jsid-post-vid1"><a href="https://9gag.com/gag/vid1abc">v</a><video></video></article>' +
      '<article id="jsid-post-img1"><a href="https://9gag.com/gag/img1abc">i</a><img src="https://img-9gag-fun.9cache.com/photo/img1abc_700.jpg"></article>',
    );
    const hits = ninegag(collectMedia());
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ resolveHint: { platform: '9gag', id: 'vid1abc' } });
  });

  it('ignores a 9GAG section page (no post id)', () => {
    setBody('<article><a href="https://9gag.com/trending">trending</a><video></video></article>');
    expect(ninegag(collectMedia())).toHaveLength(0);
  });
});

describe('collectMedia — shadow DOM', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('collects <img> inside an open shadow root', () => {
    setBody('<div id="host"></div>');
    const sr = document.getElementById('host')!.attachShadow({ mode: 'open' });
    sr.innerHTML = '<img src="https://cdn.com/shadow.jpg">';
    expect(collectMedia().map((i) => i.src)).toContain('https://cdn.com/shadow.jpg');
  });

  it('collects <video> sources inside an open shadow root', () => {
    setBody('<div id="host"></div>');
    const sr = document.getElementById('host')!.attachShadow({ mode: 'open' });
    sr.innerHTML = '<video src="https://cdn.com/clip.mp4"></video>';
    const vids = collectMedia().filter((m) => m.kind === 'video');
    expect(vids.map((v) => v.src)).toContain('https://cdn.com/clip.mp4');
  });

  it('descends into nested open shadow roots', () => {
    setBody('<div id="host"></div>');
    const outer = document.getElementById('host')!.attachShadow({ mode: 'open' });
    outer.innerHTML = '<div id="inner"></div><img src="https://cdn.com/outer.jpg">';
    const innerRoot = outer.getElementById('inner')!.attachShadow({ mode: 'open' });
    innerRoot.innerHTML = '<img src="https://cdn.com/inner.jpg">';
    const srcs = collectMedia().map((i) => i.src);
    expect(srcs).toEqual(expect.arrayContaining(['https://cdn.com/outer.jpg', 'https://cdn.com/inner.jpg']));
  });

  it('does not reach media inside a closed shadow root (inaccessible by design)', () => {
    setBody('<div id="host"></div>');
    const sr = document.getElementById('host')!.attachShadow({ mode: 'closed' });
    sr.innerHTML = '<img src="https://cdn.com/closed.jpg">';
    expect(collectMedia().map((i) => i.src)).not.toContain('https://cdn.com/closed.jpg');
  });

  it('does not double-count a light-DOM image that is also slotted', () => {
    setBody('<div id="host"><img src="https://cdn.com/slotted.jpg"></div>');
    const sr = document.getElementById('host')!.attachShadow({ mode: 'open' });
    sr.innerHTML = '<slot></slot>';
    const slotted = collectMedia().filter((i) => i.src === 'https://cdn.com/slotted.jpg');
    expect(slotted).toHaveLength(1);
  });

  it('excludes media inside the extension\'s own bubble-host shadow root', () => {
    setBody(`<div id="${HOST_ID}"></div><div id="other-host"></div>`);
    const bubbleHost = document.getElementById(HOST_ID)!;
    const bubbleShadow = bubbleHost.attachShadow({ mode: 'open' });
    bubbleShadow.innerHTML = '<img src="https://cdn.com/bubble-image.jpg">';

    const otherHost = document.getElementById('other-host')!;
    const otherShadow = otherHost.attachShadow({ mode: 'open' });
    otherShadow.innerHTML = '<img src="https://cdn.com/other-shadow.jpg">';

    const media = collectMedia();
    const srcs = media.map((i) => i.src);
    // Bubble-host media is NOT collected (extension's own UI must not be scanned)
    expect(srcs).not.toContain('https://cdn.com/bubble-image.jpg');
    // But other shadow roots ARE still scanned
    expect(srcs).toContain('https://cdn.com/other-shadow.jpg');
  });
});

describe('twitter pending video collection', () => {
  afterEach(() => { document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });

  it('collects a <video> with an ext_tw_video_thumb poster as one pending video, drops the blob, and takes the status id from the page URL', () => {
    window.history.replaceState({}, '', '/JJuan/status/2006397496638206090');
    document.body.innerHTML = `
      <div data-testid="videoComponent">
        <video poster="https://pbs.twimg.com/ext_tw_video_thumb/2006397459065675776/pu/img/mfCoGhez3VQqQqV8.jpg">
          <source type="video/mp4" src="blob:https://x.com/5b0c9faf">
        </video>
        <img src="https://pbs.twimg.com/ext_tw_video_thumb/2006397459065675776/pu/img/mfCoGhez3VQqQqV8.jpg">
      </div>`;
    const media = collectMedia();
    const videos = media.filter((m) => m.kind === 'video');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '2006397496638206090' } });
    // the poster never leaks in as a downloadable image, and the blob is dropped
    expect(media.some((m) => m.kind === 'image')).toBe(false);
    expect(media.some((m) => m.src.startsWith('blob:'))).toBe(false);
  });
});
