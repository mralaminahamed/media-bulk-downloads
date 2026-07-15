import { wallpaperscraftResolver } from '@mbd/core/resolvers/sites/wallpaperscraft';

const ctx = { allowNetwork: false as const };
const previewUrl = 'https://images.wallpaperscraft.com/image/single/lamp_outlet_idea_120422_1280x720.jpg';

/** Build a preview <img> whose page also lists `/download/<slug>/<res>` links, and
 *  return the <img> to pass as ctx.el. */
function pageWith(imgSrc: string, downloadHrefs: string[]): HTMLImageElement {
  document.body.innerHTML = '';
  const img = document.createElement('img');
  img.setAttribute('src', imgSrc);
  document.body.appendChild(img);
  for (const href of downloadHrefs) {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    document.body.appendChild(a);
  }
  return img;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('wallpaperscraftResolver.match', () => {
  it('owns images.wallpaperscraft.com single images', () => {
    expect(wallpaperscraftResolver.match(new URL(previewUrl), ctx)).toBe(true);
  });
  it('ignores the page host and other paths', () => {
    expect(wallpaperscraftResolver.match(new URL('https://wallpaperscraft.com/wallpaper/lamp_outlet_idea_120422'), ctx)).toBe(false);
    expect(wallpaperscraftResolver.match(new URL('https://images.wallpaperscraft.com/image/300/foo.jpg'), ctx)).toBe(false);
  });
});

describe('wallpaperscraftResolver.resolve', () => {
  it('upgrades the preview to the largest resolution the page lists', () => {
    const img = pageWith(previewUrl, [
      '/download/lamp_outlet_idea_120422/1920x1080',
      '/download/lamp_outlet_idea_120422/3840x2160',
      '/download/lamp_outlet_idea_120422/2560x1440',
    ]);
    const [c] = wallpaperscraftResolver.resolve(new URL(previewUrl), { el: img, ...ctx });
    expect(c).toMatchObject({
      kind: 'image',
      url: 'https://images.wallpaperscraft.com/image/single/lamp_outlet_idea_120422_3840x2160.jpg',
      ext: 'jpg',
      width: 3840,
      height: 2160,
    });
    expect(c.thumbnailSrc).toBe(previewUrl);
  });

  it('preserves the file extension (png)', () => {
    const src = 'https://images.wallpaperscraft.com/image/single/abstract_neon_1280x720.png';
    const img = pageWith(src, ['/download/abstract_neon/2560x1440']);
    const [c] = wallpaperscraftResolver.resolve(new URL(src), { el: img, ...ctx });
    expect(c.url).toBe('https://images.wallpaperscraft.com/image/single/abstract_neon_2560x1440.png');
    expect(c.ext).toBe('png');
  });

  it('returns [] when the page lists nothing larger than the preview', () => {
    const img = pageWith(previewUrl, ['/download/lamp_outlet_idea_120422/1280x720', '/download/lamp_outlet_idea_120422/800x600']);
    expect(wallpaperscraftResolver.resolve(new URL(previewUrl), { el: img, ...ctx })).toEqual([]);
  });

  it('ignores download links belonging to a different wallpaper', () => {
    const img = pageWith(previewUrl, ['/download/some_other_wallpaper/3840x2160']);
    expect(wallpaperscraftResolver.resolve(new URL(previewUrl), { el: img, ...ctx })).toEqual([]);
  });

  it('returns [] with no DOM element (nothing to read the resolution list from)', () => {
    expect(wallpaperscraftResolver.resolve(new URL(previewUrl), ctx)).toEqual([]);
  });

  it('returns [] for a malformed single path (no <res> suffix)', () => {
    const bad = 'https://images.wallpaperscraft.com/image/single/no_resolution_here.jpg';
    const img = pageWith(bad, ['/download/no_resolution_here/3840x2160']);
    expect(wallpaperscraftResolver.resolve(new URL(bad), { el: img, ...ctx })).toEqual([]);
  });
});
