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
