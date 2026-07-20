import { artstationResolver } from '@mbd/core/resolvers/sites/artstation';
import { ResolveContext } from '@mbd/core/resolvers/types';

const resolve = (href: string, ctx: ResolveContext = { allowNetwork: false }) =>
  artstationResolver.resolve(new URL(href), ctx);
const m = (href: string) => artstationResolver.match(new URL(href), { allowNetwork: false });

const asset = (bucket: string) =>
  `https://cdna.artstation.com/p/assets/images/images/100/627/266/${bucket}/ed-pantera-ts01.jpg`;
const LARGE = asset('large');

/** A poster <img> in an artwork cell, optionally a video clip / artwork link. */
function poster({ href, video }: { href?: string; video?: boolean } = {}): Element {
  const cell = document.createElement('div');
  cell.setAttribute('data-test-id', 'project');
  const inner = href ? (() => { const a = document.createElement('a'); a.setAttribute('href', href); cell.appendChild(a); return a; })() : cell;
  const im = document.createElement('img');
  inner.appendChild(im);
  if (video) {
    const f = document.createElement('iframe');
    f.setAttribute('src', 'https://www.artstation.com/api/v2/animation/video_clips/uuid/embed.html?s=x');
    inner.appendChild(f);
  }
  return im;
}

describe('artstationResolver — match', () => {
  it('matches cdn[ab].artstation.com asset paths, not the logo CDN or others', () => {
    expect(m(asset('small'))).toBe(true);
    expect(m('https://cdnb.artstation.com/p/assets/covers/images/1/2/3/large/c.jpg')).toBe(true);
    expect(m('https://cdn.artstation.com/assets/logo-monochrome.svg')).toBe(false);
    expect(m('https://cdna.artstation.com/favicon.ico')).toBe(false);
    expect(m('https://example.com/x.jpg')).toBe(false);
  });
});

describe('artstationResolver — images', () => {
  it('upgrades a small crop to /large/ and hints for the /4k/ upgrade', () => {
    const [c] = resolve(asset('small'));
    expect(c).toMatchObject({ kind: 'image', url: LARGE, resolveHint: { platform: 'artstation', id: `img ${LARGE}` } });
    expect(c.thumbnailSrc).toBe(asset('small'));
  });

  it('leaves an already-/large/ URL unchanged but still hints', () => {
    const [c] = resolve(LARGE);
    expect(c.url).toBe(LARGE);
    expect(c.thumbnailSrc).toBeUndefined();
    expect(c.resolveHint).toEqual({ platform: 'artstation', id: `img ${LARGE}` });
  });
});

describe('artstationResolver — video', () => {
  it('emits a pending video with an artstation vid hint when the cell has an embed + a hash', () => {
    const [c] = resolve(asset('large'), { allowNetwork: false, el: poster({ href: '/artwork/V25orP', video: true }) });
    expect(c).toMatchObject({ kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'artstation', id: 'vid V25orP' } });
  });

  it('recovers the hash from the page URL when no artwork link wraps the poster', () => {
    const [c] = resolve(asset('large'), { allowNetwork: false, el: poster({ video: true }), pageUrl: 'https://www.artstation.com/artwork/V25orP' });
    expect(c.resolveHint).toEqual({ platform: 'artstation', id: 'vid V25orP' });
  });

  it('falls back to the image when a video signal is present but no hash is recoverable', () => {
    const [c] = resolve(asset('small'), { allowNetwork: false, el: poster({ video: true }) });
    expect(c.kind).toBe('image');
    expect(c.url).toBe(LARGE);
  });

  it('does not treat a still image as video (no signal), even inside an /artwork/ link', () => {
    const [c] = resolve(asset('small'), { allowNetwork: false, el: poster({ href: '/artwork/V25orP' }) });
    expect(c.kind).toBe('image');
    expect(c.resolveHint).toEqual({ platform: 'artstation', id: `img ${LARGE}` });
  });
});

describe('artstationResolver — edge cases', () => {
  it('keeps a /4k/ image as-is and hints (the tier finds no /large/ to swap, so it stays max)', () => {
    const fourk = 'https://cdna.artstation.com/p/assets/images/images/100/627/266/4k/ed-pantera-ts01.jpg';
    const [c] = resolve(fourk);
    expect(c).toMatchObject({ kind: 'image', url: fourk, resolveHint: { platform: 'artstation', id: `img ${fourk}` } });
  });

  it('upgrades a cover asset path to /large/', () => {
    const [c] = resolve('https://cdnb.artstation.com/p/assets/covers/images/100/600/391/small/cover.jpg');
    expect(c.url).toBe('https://cdnb.artstation.com/p/assets/covers/images/100/600/391/large/cover.jpg');
  });

  it('accepts a class-based video signal (obfuscation-tolerant)', () => {
    const cell = document.createElement('div');
    const a = document.createElement('a'); a.setAttribute('href', '/artwork/AbC123');
    a.appendChild(document.createElement('img'));
    const overlay = document.createElement('div'); overlay.className = 'ProjectVideoPlayer';
    cell.append(a, overlay);
    const [c] = resolve(asset('large'), { allowNetwork: false, el: a.querySelector('img')! });
    expect(c).toMatchObject({ kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'artstation', id: 'vid AbC123' } });
  });

  it('does NOT match a cdn[ab] path with no image size bucket (left to the generic resolver)', () => {
    const ctx = { allowNetwork: false };
    expect(artstationResolver.match(new URL('https://cdna.artstation.com/p/assets/covers/videos/foo.mp4'), ctx)).toBe(false);
    expect(artstationResolver.match(new URL('https://cdna.artstation.com/p/static/logo.svg'), ctx)).toBe(false);
  });
});
