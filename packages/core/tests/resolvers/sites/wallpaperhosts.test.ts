import { wallpaperHostsResolver } from '@mbd/core/resolvers/sites/wallpaperhosts';

const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });

describe('wallpaperHostsResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches only the two supported page hosts', () => {
    const u = new URL('https://4kwallpapers.com/images/walls/thumbs_2t/1.jpg');
    expect(wallpaperHostsResolver.match(u, ctx(undefined, 'https://4kwallpapers.com/nature/x-1.html'))).toBe(true);
    expect(wallpaperHostsResolver.match(u, ctx(undefined, 'https://wallpaperswide.com/x-wallpapers.html'))).toBe(true);
    expect(wallpaperHostsResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
  });

  it('4kWallpapers: returns the largest-area /images/wallpapers/ anchor (native res)', () => {
    const PAGE = 'https://4kwallpapers.com/nature/thick-forest-misty-26360.html';
    // Standard-aspect crops + the non-standard native original; max pixel-area wins.
    document.body.innerHTML =
      '<a href="/images/wallpapers/thick-forest-misty-1920x1080-26360.jpg">1080p</a>' +
      '<a href="/images/wallpapers/thick-forest-misty-3840x2160-26360.jpg">4K</a>' +
      '<a id="resolution" class="current" href="/images/wallpapers/thick-forest-misty-5120x3413-26360.jpg">Original</a>';
    const img = document.createElement('img');
    img.setAttribute('src', 'https://4kwallpapers.com/images/walls/thumbs_2t/26360.jpg');
    document.body.appendChild(img);
    const [c] = wallpaperHostsResolver.resolve(
      new URL('https://4kwallpapers.com/images/walls/thumbs_2t/26360.jpg'), ctx(img, PAGE));
    expect(c.url).toBe('https://4kwallpapers.com/images/wallpapers/thick-forest-misty-5120x3413-26360.jpg');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('jpg');
    expect(c.thumbnailSrc).toBe('https://4kwallpapers.com/images/walls/thumbs_2t/26360.jpg');
  });

  it('WallpapersWide: returns the max-area /download/ link from the resolutions list', () => {
    const PAGE = 'https://wallpaperswide.com/aerial_beach-wallpapers.html';
    document.body.innerHTML =
      '<div class="wallpaper-resolutions">' +
      '<a href="/download/aerial_beach-wallpaper-1920x1080.jpg">HD</a>' +
      '<a href="/download/aerial_beach-wallpaper-3840x2560.jpg">4K</a>' +
      '<a href="/download/aerial_beach-wallpaper-5120x2880.jpg">5K</a></div>';
    const img = document.createElement('img');
    img.setAttribute('src', 'https://wallpaperswide.com/wallpapers/aerial_beach-thumbnail.jpg');
    document.body.appendChild(img);
    const [c] = wallpaperHostsResolver.resolve(
      new URL('https://wallpaperswide.com/wallpapers/aerial_beach-thumbnail.jpg'), ctx(img, PAGE));
    expect(c.url).toBe('https://wallpaperswide.com/download/aerial_beach-wallpaper-5120x2880.jpg');
  });

  it('returns [] when no download anchors are present', () => {
    const PAGE = 'https://4kwallpapers.com/nature/x-1.html';
    const img = document.createElement('img');
    img.setAttribute('src', 'https://4kwallpapers.com/images/walls/thumbs_2t/1.jpg');
    document.body.appendChild(img);
    expect(wallpaperHostsResolver.resolve(
      new URL('https://4kwallpapers.com/images/walls/thumbs_2t/1.jpg'), ctx(img, PAGE))).toEqual([]);
  });
});
