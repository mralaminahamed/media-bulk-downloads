import { collectMedia } from '@/extension/collect';

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

  it('collects a <video> with poster and <source>s, skipping streams', () => {
    document.body.innerHTML = `
      <video poster="https://ex.com/p.jpg" aria-label="Clip">
        <source src="https://ex.com/v.mp4" type="video/mp4">
        <source src="https://ex.com/live.m3u8" type="application/x-mpegURL">
      </video>`;
    const media = collectMedia();
    const vid = media.find((m) => m.src === 'https://ex.com/v.mp4');
    expect(vid).toMatchObject({ kind: 'video', type: 'mp4', poster: 'https://ex.com/p.jpg', alt: 'Clip' });
    expect(media.some((m) => m.src.endsWith('.m3u8'))).toBe(false);
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
