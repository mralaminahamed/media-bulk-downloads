import { animePicturesResolver } from '@mbd/core/resolvers/sites/animepictures';

const PAGE = 'https://anime-pictures.net/posts/923819?lang=en';
const MD5 = '1dc19bf7f5da39d4d649b9ffe7127149';
const PREVIEW = `https://opreviews.anime-pictures.net/${MD5.slice(0, 3)}/${MD5}_bp.avif`;
const DOWNLOAD = 'https://api.anime-pictures.net/pictures/download_image/923819-2177x4096-tag.jpg';
const ctx = (el: Element | undefined, pageUrl = PAGE) => ({ el, allowNetwork: false as const, pageUrl });

function setup({ og = PREVIEW, dl = DOWNLOAD }: { og?: string; dl?: string } = {}): HTMLImageElement {
  document.head.innerHTML = og ? `<meta property="og:image" content="${og}">` : '';
  document.body.innerHTML = dl ? `<a class="icon-download" href="${dl}">download</a>` : '';
  const img = document.createElement('img');
  img.setAttribute('src', PREVIEW);
  document.body.appendChild(img);
  return img;
}

describe('animePicturesResolver', () => {
  beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; });

  it('matches the opreviews host only on an anime-pictures.net page', () => {
    const u = new URL(PREVIEW);
    expect(animePicturesResolver.match(u, ctx(undefined))).toBe(true);
    expect(animePicturesResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
    expect(animePicturesResolver.match(new URL('https://cdn.other.net/x_bp.avif'), ctx(undefined))).toBe(false);
  });

  it('upgrades the main preview to the download_image original (md5 matches og:image)', () => {
    const img = setup();
    const [c] = animePicturesResolver.resolve(new URL(PREVIEW), ctx(img));
    expect(c.url).toBe(DOWNLOAD);
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('jpg');
    expect(c.thumbnailSrc).toBe(PREVIEW);
    expect(c.mediaKey).toBe(`animepictures ${MD5}`);
  });

  it('does NOT upgrade a related-post thumbnail (md5 differs from og:image)', () => {
    setup();
    const otherMd5 = 'ffffffffffffffffffffffffffffffff';
    const thumb = `https://opreviews.anime-pictures.net/fff/${otherMd5}_sp.avif`;
    const img = document.createElement('img');
    img.setAttribute('src', thumb);
    document.body.appendChild(img);
    expect(animePicturesResolver.resolve(new URL(thumb), ctx(img))).toEqual([]);
  });

  it('returns [] when no download anchor is present (logged-out / no link)', () => {
    const img = setup({ dl: '' });
    expect(animePicturesResolver.resolve(new URL(PREVIEW), ctx(img))).toEqual([]);
  });

  it('rejects an off-domain download href (tampered)', () => {
    const img = setup({ dl: 'https://evil.example.com/pictures/download_image/x.jpg' });
    expect(animePicturesResolver.resolve(new URL(PREVIEW), ctx(img))).toEqual([]);
  });

  it('rejects a same-domain href that is not a download_image path', () => {
    const img = setup({ dl: 'https://api.anime-pictures.net/pictures/other/x.jpg' });
    expect(animePicturesResolver.resolve(new URL(PREVIEW), ctx(img))).toEqual([]);
  });

  it('marks a .gif original as kind gif', () => {
    const img = setup({ dl: 'https://api.anime-pictures.net/pictures/download_image/1-anim.gif' });
    const [c] = animePicturesResolver.resolve(new URL(PREVIEW), ctx(img));
    expect(c.kind).toBe('gif');
    expect(c.ext).toBe('gif');
  });
});
