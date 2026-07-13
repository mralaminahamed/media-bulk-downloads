import { threadsResolver } from '@mbd/core/resolvers/sites/threads';
import { ResolveContext } from '@mbd/core/resolvers/types';

const u = (s: string) => new URL(s);

// A Threads /media grid <img>: displayed small, but its srcset ships the full
// original (2610w) — same pathname, size encoded only in the query token.
const BASE = 'https://scontent-del2-2.cdninstagram.com/v/t51.82787-15/742241727_18.jpg';
const THUMB = `${BASE}?stp=dst-jpg_e35_s240x240&_nc_ht=x`;
const SRCSET = [
  `${BASE}?stp=dst-jpg_e35_s2610x2610&_nc=1 2610w`,
  `${BASE}?stp=dst-jpg_e35_s1080x1080&_nc=1 1080w`,
  `${BASE}?stp=dst-jpg_e35_s640x640&_nc=1 640w`,
  `${BASE}?stp=dst-jpg_e35_s240x240&_nc=1 240w`,
].join(', ');

const THREADS_PAGE = 'https://www.threads.com/@vaishnavi_buddharaju/media';

function gridImg(srcset = SRCSET): HTMLImageElement {
  document.body.innerHTML = '';
  const img = document.createElement('img');
  img.setAttribute('src', THUMB);
  if (srcset) img.setAttribute('srcset', srcset);
  document.body.appendChild(img);
  return img;
}

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  allowNetwork: false,
  pageUrl: THREADS_PAGE,
  ...over,
});

describe('threadsResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  describe('match', () => {
    it('matches a cdninstagram image on a threads.com page', () => {
      expect(threadsResolver.match(u(THUMB), ctx())).toBe(true);
    });

    it('matches an fbcdn.net image on a threads.com page', () => {
      const fb = u('https://scontent.xx.fbcdn.net/v/t51/1_n.jpg');
      expect(threadsResolver.match(fb, ctx())).toBe(true);
    });

    it('matches threads.net as well as threads.com', () => {
      expect(threadsResolver.match(u(THUMB), ctx({ pageUrl: 'https://www.threads.net/@x' }))).toBe(true);
    });

    it('does NOT match on instagram.com (leaves it to the Instagram resolver)', () => {
      expect(threadsResolver.match(u(THUMB), ctx({ pageUrl: 'https://www.instagram.com/x/' }))).toBe(false);
    });

    it('does NOT match a non-Meta CDN host, even on threads.com', () => {
      expect(threadsResolver.match(u('https://example.com/a.jpg'), ctx())).toBe(false);
    });

    it('does NOT match when pageUrl is missing', () => {
      expect(threadsResolver.match(u(THUMB), ctx({ pageUrl: undefined }))).toBe(false);
    });
  });

  describe('resolve', () => {
    it('returns the widest srcset candidate (the full original), not the thumbnail', () => {
      const el = gridImg();
      const out = threadsResolver.resolve(u(THUMB), ctx({ el }));
      expect(out).toHaveLength(1);
      expect(out[0].kind).toBe('image');
      expect(out[0].url).toContain('s2610x2610');
      expect(out[0].url).not.toContain('s240x240');
    });

    it('reports the intrinsic width from the widest w-descriptor', () => {
      const el = gridImg();
      expect(threadsResolver.resolve(u(THUMB), ctx({ el }))[0].width).toBe(2610);
    });

    it('derives height from the element aspect ratio when the image has loaded', () => {
      const el = gridImg();
      // jsdom has no layout, so fake the loaded thumb's intrinsic size (0.75 aspect).
      Object.defineProperty(el, 'naturalWidth', { value: 480, configurable: true });
      Object.defineProperty(el, 'naturalHeight', { value: 640, configurable: true });
      expect(threadsResolver.resolve(u(THUMB), ctx({ el }))[0].height).toBe(3480); // 2610 * 640/480
    });

    it('falls back to the given URL when the element has no srcset', () => {
      const el = gridImg('');
      const out = threadsResolver.resolve(u(THUMB), ctx({ el }));
      expect(out[0].url).toBe(THUMB);
    });

    it('falls back to the given URL when there is no element', () => {
      const out = threadsResolver.resolve(u(THUMB), ctx({ el: undefined }));
      expect(out[0].url).toBe(THUMB);
    });

    it('also reads a lazy data-srcset', () => {
      document.body.innerHTML = '';
      const img = document.createElement('img');
      img.setAttribute('data-srcset', SRCSET);
      document.body.appendChild(img);
      expect(threadsResolver.resolve(u(THUMB), ctx({ el: img }))[0].url).toContain('s2610x2610');
    });
  });
});
