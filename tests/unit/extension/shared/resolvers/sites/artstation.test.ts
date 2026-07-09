import { artstationResolver } from '@/extension/shared/resolvers/sites/artstation';
import { ResolveContext } from '@/extension/shared/resolvers/types';

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
    expect(m('https://cdn.artstation.com/assets/logo-monochrome.svg')).toBe(false); // logo host, no asset path
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
