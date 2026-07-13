/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/" }
 *
 * facebookResolver.match reads location.hostname (onFacebook gate) and
 * parseHydration reads `document`, so this file pins jsdom's location to
 * facebook.com (jsdom's `location` is immutable at runtime — LegacyUnforgeable
 * — so the host has to be fixed per file via `@vitest-environment-options`,
 * same pattern as relay-ig.test.ts / relay-x.test.ts). The "off facebook.com"
 * half of the match gate is covered in the sibling file facebook-offhost.test.ts,
 * which stays at jsdom's default (non-facebook) location.
 */
import { ingestSniffedFbMedia, __resetFbResolver, facebookResolver, facebookPageMedia } from '@mbd/core/resolvers/sites/facebook';

const CDN = 'https://x.fbcdn.net';

/** Put an FB hydration JSON blob into a <script type="application/json"> the resolver reads. */
function hydrate(obj: unknown): void {
  const s = document.createElement('script');
  s.type = 'application/json';
  s.textContent = JSON.stringify(obj);
  document.body.appendChild(s);
}

function u(href: string): URL {
  return new URL(href);
}

/** ctx whose el.closest resolves the given href for any 'a[href*=...]' selector. */
const ctxWithLink = (href: string, pageUrl = 'https://www.facebook.com/x') => ({
  allowNetwork: false,
  pageUrl,
  el: { closest: (sel: string) => (sel.includes('href') ? { getAttribute: () => href } : null) } as unknown as Element,
});

beforeEach(() => {
  document.body.innerHTML = '';
  __resetFbResolver();
});

describe('facebookResolver.match', () => {
  it('is true for an fbcdn URL while on facebook.com', () => {
    // Prove the jsdom env is actually pinned before trusting the true result below.
    expect(location.hostname).toBe('www.facebook.com');
    expect(facebookResolver.match(u(`${CDN}/a.jpg`), { allowNetwork: false })).toBe(true);
    expect(facebookResolver.match(u('https://scontent.xx.fbcdn.net/x.mp4'), { allowNetwork: false })).toBe(true);
  });

  it('is false for a non-fbcdn URL even while on facebook.com', () => {
    expect(location.hostname).toBe('www.facebook.com');
    expect(facebookResolver.match(u('https://www.facebook.com/photo.jpg'), { allowNetwork: false })).toBe(false);
    expect(facebookResolver.match(u('https://evilfbcdn.net/x.jpg'), { allowNetwork: false })).toBe(false);
  });
});

describe('ingestSniffedFbMedia + facebookResolver.resolve', () => {
  it('stores a valid image and the resolver returns it for its fbid (fbid from enclosing anchor)', () => {
    ingestSniffedFbMedia([{ fbid: '100', kind: 'image', url: `${CDN}/orig_n.jpg`, ext: 'jpg', width: 2048, height: 1536 }]);
    const out = facebookResolver.resolve(u(`${CDN}/thumb_n.jpg`), ctxWithLink('/photo/?fbid=100'));
    expect(out).toEqual([{ url: `${CDN}/orig_n.jpg`, kind: 'image', ext: 'jpg', width: 2048, height: 1536, mediaKey: 'fb:100' }]);
  });

  it('resolves via ctx.pageUrl when there is no enclosing photo/video link', () => {
    ingestSniffedFbMedia([{ fbid: '150', kind: 'image', url: `${CDN}/pageonly_n.jpg`, ext: 'jpg', width: 1024, height: 768 }]);
    const out = facebookResolver.resolve(u(`${CDN}/thumb_n.jpg`), {
      allowNetwork: false,
      pageUrl: 'https://www.facebook.com/photo/?fbid=150',
    });
    expect(out).toEqual([{ url: `${CDN}/pageonly_n.jpg`, kind: 'image', ext: 'jpg', width: 1024, height: 768, mediaKey: 'fb:150' }]);
  });

  it('returns a video candidate with kind:video and the HD mp4 url', () => {
    ingestSniffedFbMedia([{ fbid: '200', kind: 'video', url: `${CDN}/hd_720.mp4`, ext: 'mp4', width: 1280, height: 720, poster: `${CDN}/hd_poster.jpg` }]);
    const out = facebookResolver.resolve(u(`${CDN}/hd_poster.jpg`), ctxWithLink('/videos/200'));
    expect(out).toEqual([{ url: `${CDN}/hd_720.mp4`, kind: 'video', ext: 'mp4', width: 1280, height: 720, poster: `${CDN}/hd_poster.jpg`, mediaKey: 'fb:200' }]);
  });

  it('keys a photo tile whose anchor uses the /<page>/photos/<id>/ path form', () => {
    document.body.innerHTML = '<a href="/natgeo/photos/777/"><img src="https://x.fbcdn.net/v/grid_777_n.jpg"></a>';
    ingestSniffedFbMedia([
      { fbid: '777', kind: 'image', url: 'https://x.fbcdn.net/v/orig_777_n.jpg', width: 2048, height: 1536 },
    ]);
    const img = document.querySelector('img') as Element;
    const out = facebookResolver.resolve(new URL('https://x.fbcdn.net/v/grid_777_n.jpg'), {
      allowNetwork: false,
      pageUrl: 'https://www.facebook.com/natgeo/photos',
      el: img,
    } as unknown as Parameters<typeof facebookResolver.resolve>[1]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('orig_777_n.jpg');
  });

  it('rejects forged entries (bad host, bad fbid) and never lets a bad ext through: falls back to the kind default', () => {
    ingestSniffedFbMedia([
      { fbid: '101', kind: 'image', url: 'https://evil.com/x.jpg', ext: 'jpg', width: 9, height: 9 }, // bad host -> dropped
      { fbid: 'abc', kind: 'image', url: `${CDN}/x_n.jpg`, ext: 'jpg', width: 9, height: 9 }, // bad fbid -> dropped
      { fbid: '102', kind: 'image', url: `${CDN}/x_n.exe`, ext: 'exe', width: 9, height: 9 }, // survives; ext falls back
    ]);
    // fbid 101's forged entry was dropped, so no ORIGINAL exists — the resolver
    // still surfaces the on-page thumbnail, tagged with the photo identity so a
    // later original can upgrade-replace it.
    const passthrough = facebookResolver.resolve(u(`${CDN}/a.jpg`), ctxWithLink('/photo/?fbid=101'));
    expect(passthrough).toEqual([{ url: `${CDN}/a.jpg`, kind: 'image', mediaKey: 'fb:101' }]);
    const [c] = facebookResolver.resolve(u(`${CDN}/a.jpg`), ctxWithLink('/photo/?fbid=102'));
    // Carried assertion (b): assert the actual ext VALUE, not just "not exe".
    expect(c.ext).toBe('jpg');
  });

  it('a pending-only video (cover seen, no playable url yet) yields unresolvedVideo:true', () => {
    ingestSniffedFbMedia([{ fbid: '300', kind: 'video', url: `${CDN}/cover_n.jpg`, ext: 'jpg', poster: `${CDN}/cover_n.jpg`, pending: true }]);
    const [c] = facebookResolver.resolve(u(`${CDN}/cover_n.jpg`), ctxWithLink('/videos/300'));
    expect(c).toMatchObject({ kind: 'video', unresolvedVideo: true, poster: `${CDN}/cover_n.jpg` });
  });

  it('returns [] when no fbid can be recovered from the link or the page URL', () => {
    ingestSniffedFbMedia([{ fbid: '400', kind: 'image', url: `${CDN}/x_n.jpg`, ext: 'jpg', width: 9, height: 9 }]);
    const out = facebookResolver.resolve(u(`${CDN}/x_n.jpg`), { allowNetwork: false, pageUrl: 'https://www.facebook.com/someuser/' });
    expect(out).toEqual([]);
  });

  it('returns a tagged thumbnail passthrough when the fbid is known but nothing is ingested yet', () => {
    const out = facebookResolver.resolve(u(`${CDN}/x_n.jpg`), ctxWithLink('/photo/?fbid=999'));
    expect(out).toEqual([{ url: `${CDN}/x_n.jpg`, kind: 'image', mediaKey: 'fb:999' }]);
  });

  it('once an original is ingested, resolve returns it (not the thumbnail passthrough), tagged', () => {
    ingestSniffedFbMedia([{ fbid: '778', kind: 'image', url: `${CDN}/orig_778_n.jpg`, ext: 'jpg', width: 2048, height: 1536 }]);
    const out = facebookResolver.resolve(u(`${CDN}/grid_778_n.jpg`), ctxWithLink('/photo/?fbid=778'));
    expect(out).toEqual([{ url: `${CDN}/orig_778_n.jpg`, kind: 'image', ext: 'jpg', width: 2048, height: 1536, mediaKey: 'fb:778' }]);
  });
});

describe('carried assertion (a): store cap newest-wins DIRECTION', () => {
  it('after >4000 entries for one fbid, resolve returns the NEWEST url, not an evicted older one', () => {
    const many = Array.from({ length: 4001 }, (_, i) => ({
      fbid: '500', kind: 'image' as const, url: `${CDN}/MANY_${i}_n.jpg`, ext: 'jpg', width: 1440, height: 1440,
    }));
    ingestSniffedFbMedia(many);
    const out = facebookResolver.resolve(u(`${CDN}/thumb.jpg`), ctxWithLink('/photo/?fbid=500'));
    // Index 0 (the oldest) was evicted by the 4000 cap; the newest (index 4000) must survive.
    expect(out.some((c) => c.url === `${CDN}/MANY_0_n.jpg`)).toBe(false);
    expect(out.some((c) => c.url === `${CDN}/MANY_4000_n.jpg`)).toBe(true);
  });

  it('facebookPageMedia also reflects the newest surviving entry after eviction', () => {
    const many = Array.from({ length: 4001 }, (_, i) => ({
      fbid: '501', kind: 'image' as const, url: `${CDN}/PAGE_${i}_n.jpg`, ext: 'jpg', width: 1440, height: 1440,
    }));
    ingestSniffedFbMedia(many);
    const out = facebookPageMedia('https://www.facebook.com/photo/?fbid=501');
    expect(out.some((c) => c.url === `${CDN}/PAGE_0_n.jpg`)).toBe(false);
    expect(out.some((c) => c.url === `${CDN}/PAGE_4000_n.jpg`)).toBe(true);
  });
});

describe('carried assertion (c): poster host-pinned + video-only', () => {
  it('pins a valid poster to a video candidate', () => {
    ingestSniffedFbMedia([{ fbid: '600', kind: 'video', url: `${CDN}/clip.mp4`, ext: 'mp4', poster: `${CDN}/poster_n.jpg` }]);
    const [c] = facebookResolver.resolve(u(`${CDN}/poster_n.jpg`), ctxWithLink('/videos/600'));
    expect(c.poster).toBe(`${CDN}/poster_n.jpg`);
  });

  it('drops a forged non-fbcdn poster (never surfaces an unpinned host)', () => {
    ingestSniffedFbMedia([{ fbid: '601', kind: 'video', url: `${CDN}/clip2.mp4`, ext: 'mp4', poster: 'https://evil.com/exfil.jpg' }]);
    const [c] = facebookResolver.resolve(u(`${CDN}/thumb.jpg`), ctxWithLink('/videos/601'));
    expect(c.poster).toBeUndefined();
  });

  it('never attaches a poster to an image candidate', () => {
    ingestSniffedFbMedia([{ fbid: '602', kind: 'image', url: `${CDN}/img_n.jpg`, ext: 'jpg', width: 10, height: 10 }]);
    const [c] = facebookResolver.resolve(u(`${CDN}/img_n.jpg`), ctxWithLink('/photo/?fbid=602'));
    expect(c.poster).toBeUndefined();
  });
});

describe('facebookPageMedia', () => {
  it('returns the video for fbid 200 from a /watch/?v= page URL', () => {
    ingestSniffedFbMedia([{ fbid: '200', kind: 'video', url: `${CDN}/watch_hd.mp4`, ext: 'mp4', width: 1920, height: 1080, poster: `${CDN}/watch_poster.jpg` }]);
    const out = facebookPageMedia('https://www.facebook.com/watch/?v=200');
    expect(out).toEqual([{ url: `${CDN}/watch_hd.mp4`, kind: 'video', ext: 'mp4', width: 1920, height: 1080, poster: `${CDN}/watch_poster.jpg`, mediaKey: 'fb:200' }]);
  });

  it('returns [] when the URL carries no recoverable fbid', () => {
    expect(facebookPageMedia('https://www.facebook.com/someuser/')).toEqual([]);
    expect(facebookPageMedia(undefined)).toEqual([]);
  });

  it('returns [] when the fbid is known but nothing has been ingested for it', () => {
    expect(facebookPageMedia('https://www.facebook.com/photo/?fbid=987654')).toEqual([]);
  });
});

describe('FR1: largest-image-per-fbid collapse across separate store ingests', () => {
  it('facebookResolver.resolve returns only the largest image when a small grid thumbnail and a large photo-open original arrive as SEPARATE ingests for the same fbid', () => {
    ingestSniffedFbMedia([{ fbid: '900', kind: 'image', url: `${CDN}/thumb_900_n.jpg`, ext: 'jpg', width: 200, height: 200 }]);
    ingestSniffedFbMedia([{ fbid: '900', kind: 'image', url: `${CDN}/orig_900_n.jpg`, ext: 'jpg', width: 2048, height: 1536 }]);
    const out = facebookResolver.resolve(u(`${CDN}/thumb_900_n.jpg`), ctxWithLink('/photo/?fbid=900'));
    const images = out.filter((c) => c.kind === 'image');
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe(`${CDN}/orig_900_n.jpg`);
  });

  it('facebookPageMedia returns only the largest image when a small grid thumbnail and a large photo-open original arrive as SEPARATE ingests for the same fbid', () => {
    ingestSniffedFbMedia([{ fbid: '901', kind: 'image', url: `${CDN}/thumb_901_n.jpg`, ext: 'jpg', width: 160, height: 160 }]);
    ingestSniffedFbMedia([{ fbid: '901', kind: 'image', url: `${CDN}/orig_901_n.jpg`, ext: 'jpg', width: 1920, height: 1440 }]);
    const out = facebookPageMedia('https://www.facebook.com/photo/?fbid=901');
    const images = out.filter((c) => c.kind === 'image');
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe(`${CDN}/orig_901_n.jpg`);
  });
});

describe('FR2: a video poster must not also surface as a standalone downloadable image', () => {
  it('facebookResolver.resolve returns the video but drops the image entry whose url equals the video poster (same fbid)', () => {
    ingestSniffedFbMedia([
      { fbid: '910', kind: 'video', url: `${CDN}/vid_910.mp4`, ext: 'mp4', poster: `${CDN}/poster_910_n.jpg` },
      { fbid: '910', kind: 'image', url: `${CDN}/poster_910_n.jpg`, ext: 'jpg', width: 720, height: 720 },
    ]);
    const out = facebookResolver.resolve(u(`${CDN}/poster_910_n.jpg`), ctxWithLink('/videos/910'));
    expect(out.some((c) => c.kind === 'video' && c.url === `${CDN}/vid_910.mp4`)).toBe(true);
    expect(out.some((c) => c.kind === 'image' && c.url === `${CDN}/poster_910_n.jpg`)).toBe(false);
  });

  it('facebookPageMedia returns the video but drops the image entry whose url equals the video poster (same fbid)', () => {
    ingestSniffedFbMedia([
      { fbid: '911', kind: 'video', url: `${CDN}/vid_911.mp4`, ext: 'mp4', poster: `${CDN}/poster_911_n.jpg` },
      { fbid: '911', kind: 'image', url: `${CDN}/poster_911_n.jpg`, ext: 'jpg', width: 720, height: 720 },
    ]);
    const out = facebookPageMedia('https://www.facebook.com/videos/911');
    expect(out.some((c) => c.kind === 'video' && c.url === `${CDN}/vid_911.mp4`)).toBe(true);
    expect(out.some((c) => c.kind === 'image' && c.url === `${CDN}/poster_911_n.jpg`)).toBe(false);
  });
});

describe('parseHydration — embedded script[type="application/json"] parse', () => {
  it('parses an embedded hydration blob and resolves its video via facebookPageMedia', () => {
    hydrate({
      id: '700',
      playable_url_quality_hd: `${CDN}/hydrated_hd.mp4`,
      preferred_thumbnail: { image: { uri: `${CDN}/hydrated_poster.jpg` } },
    });
    const out = facebookPageMedia('https://www.facebook.com/watch/?v=700');
    expect(out).toEqual([{ url: `${CDN}/hydrated_hd.mp4`, kind: 'video', ext: 'mp4', poster: `${CDN}/hydrated_poster.jpg`, mediaKey: 'fb:700' }]);
  });

  it('skips script blocks with no fbcdn/playable_url token and invalid-JSON blocks without throwing', () => {
    hydrate({ hello: 'world', nested: { a: 1 } }); // valid JSON, no media token -> cheap-guard skip
    const bad = document.createElement('script');
    bad.type = 'application/json';
    bad.textContent = 'mentions fbcdn but is not valid json {';
    document.body.appendChild(bad); // JSON.parse throws -> swallowed
    hydrate({ id: '701', playable_url_quality_hd: `${CDN}/ok_hd.mp4` }); // the good one still resolves
    expect(facebookPageMedia('https://www.facebook.com/watch/?v=701')).toEqual([
      { url: `${CDN}/ok_hd.mp4`, kind: 'video', ext: 'mp4', mediaKey: 'fb:701' },
    ]);
  });

  it('parses each script node only once (a second call does not re-append/duplicate)', () => {
    hydrate({ id: '702', playable_url_quality_hd: `${CDN}/once_hd.mp4` });
    const first = facebookPageMedia('https://www.facebook.com/watch/?v=702');
    const second = facebookPageMedia('https://www.facebook.com/watch/?v=702');
    expect(first).toEqual(second);
    expect(second).toHaveLength(1);
  });
});
