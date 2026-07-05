import { instagramResolver, instagramPageMedia, ingestSniffedIgMedia, __resetIgResolver } from '@/extension/shared/resolvers/instagram';

const CDN = 'https://scontent-del2-3.cdninstagram.com';

/** Put an IG page-JSON blob into a <script type="application/json"> the resolver reads. */
function hydrate(obj: unknown): void {
  const s = document.createElement('script');
  s.type = 'application/json';
  s.textContent = JSON.stringify(obj);
  document.body.appendChild(s);
}

function u(href: string): URL {
  return new URL(href);
}

beforeEach(() => {
  document.body.innerHTML = '';
  __resetIgResolver();
});

describe('instagramResolver.match', () => {
  it('claims Instagram/Facebook CDN images only', () => {
    expect(instagramResolver.match(u(`${CDN}/v/t51.82787-15/x_n.jpg`), { allowNetwork: false })).toBe(true);
    expect(instagramResolver.match(u('https://scontent.xx.fbcdn.net/v/t1/y_n.jpg'), { allowNetwork: false })).toBe(true);
    expect(instagramResolver.match(u('https://www.instagram.com/p/ABC/'), { allowNetwork: false })).toBe(false);
    expect(instagramResolver.match(u('https://evilcdninstagram.com/x.jpg'), { allowNetwork: false })).toBe(false);
    expect(instagramResolver.match(u('https://pbs.twimg.com/media/x'), { allowNetwork: false })).toBe(false);
  });
});

describe('instagramResolver.resolve — grid thumbnail', () => {
  it('expands one post thumbnail into every carousel slide at full resolution', () => {
    hydrate({
      code: 'CAR',
      media_type: 8,
      carousel_media: [
        { media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/CAR_1_1440_n.jpg`, width: 1440, height: 1440 }] } },
        { media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/CAR_2_1440_n.jpg`, width: 1440, height: 1440 }] } },
      ],
    });
    // grid cell: <a href="/user/p/CAR"><img src=thumbnail></a>
    document.body.insertAdjacentHTML('beforeend', '<a href="/rashmiix/p/CAR/"><img id="t"></a>');
    const el = document.getElementById('t')!;

    const out = instagramResolver.resolve(u(`${CDN}/CAR_cover_s640_n.jpg`), { el, allowNetwork: false, pageUrl: 'https://www.instagram.com/rashmiix/' });

    expect(out).toEqual([
      { url: `${CDN}/CAR_1_1440_n.jpg`, kind: 'image', ext: 'jpg', width: 1440, height: 1440 },
      { url: `${CDN}/CAR_2_1440_n.jpg`, kind: 'image', ext: 'jpg', width: 1440, height: 1440 },
    ]);
  });
});

describe('instagramResolver.resolve — opened post via page URL', () => {
  it('resolves the post from ctx.pageUrl when there is no ancestor post link', () => {
    hydrate({
      code: 'SINGLE',
      media_type: 1,
      image_versions2: { candidates: [{ url: `${CDN}/SINGLE_1080_n.jpg`, width: 1080, height: 1350 }] },
    });
    document.body.insertAdjacentHTML('beforeend', '<div><img id="t"></div>');
    const el = document.getElementById('t')!;

    const out = instagramResolver.resolve(u(`${CDN}/SINGLE_s750_n.jpg`), {
      el,
      allowNetwork: false,
      pageUrl: 'https://www.instagram.com/rashmiix/p/SINGLE/?img_index=1',
    });

    expect(out).toEqual([{ url: `${CDN}/SINGLE_1080_n.jpg`, kind: 'image', ext: 'jpg', width: 1080, height: 1350 }]);
  });

  it('emits a video as a downloadable mp4 candidate with its poster (never unresolvedVideo)', () => {
    hydrate({
      code: 'REEL',
      media_type: 2,
      image_versions2: { candidates: [{ url: `${CDN}/REEL_poster_n.jpg`, width: 720, height: 1280 }] },
      video_versions: [{ url: `${CDN}/REEL_720.mp4`, width: 720, height: 1280, type: 101 }],
    });
    const out = instagramResolver.resolve(u(`${CDN}/REEL_poster_n.jpg`), {
      allowNetwork: false,
      pageUrl: 'https://www.instagram.com/reel/REEL/',
    });

    expect(out).toEqual([
      { url: `${CDN}/REEL_720.mp4`, kind: 'video', ext: 'mp4', width: 720, height: 1280, poster: `${CDN}/REEL_poster_n.jpg` },
    ]);
    expect(out[0].unresolvedVideo).toBeUndefined();
  });
});

describe('instagramResolver.resolve — non-post images defer to the generic resolver', () => {
  it('returns [] for an avatar with no post code (no ancestor link, profile page URL)', () => {
    hydrate({ code: 'X', media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/X_n.jpg`, width: 9, height: 9 }] } });
    document.body.insertAdjacentHTML('beforeend', '<div><img id="a"></div>');
    const el = document.getElementById('a')!;
    const out = instagramResolver.resolve(u(`${CDN}/v/t51.2885-19/avatar_n.jpg`), {
      el,
      allowNetwork: false,
      pageUrl: 'https://www.instagram.com/rashmiix/',
    });
    expect(out).toEqual([]);
  });

  it('does not mistake a tagged-user link (/username/) for a post code', () => {
    hydrate({ code: 'CAR', media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/CAR_n.jpg`, width: 1440, height: 1440 }] } });
    // img sits inside a tagged-user link only — must NOT resolve to a post.
    document.body.insertAdjacentHTML('beforeend', '<a href="/the_little_lens/"><img id="t"></a>');
    const el = document.getElementById('t')!;
    const out = instagramResolver.resolve(u(`${CDN}/some_thumb_n.jpg`), {
      el,
      allowNetwork: false,
      pageUrl: 'https://www.instagram.com/srushti/',
    });
    expect(out).toEqual([]);
  });

  it('returns [] when the post code is known but its media is not in the JSON yet', () => {
    document.body.insertAdjacentHTML('beforeend', '<a href="/user/p/MISSING/"><img id="t"></a>');
    const el = document.getElementById('t')!;
    const out = instagramResolver.resolve(u(`${CDN}/thumb_n.jpg`), { el, allowNetwork: false, pageUrl: 'https://www.instagram.com/user/' });
    expect(out).toEqual([]);
  });
});

describe('instagramPageMedia — opened single post/reel page', () => {
  it('returns every slide + mp4 for the post in the page URL, covering blob videos', () => {
    hydrate({
      code: 'MIX',
      media_type: 8,
      carousel_media: [
        { media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/MIX_1_n.jpg`, width: 1440, height: 1440 }] } },
        {
          media_type: 2,
          image_versions2: { candidates: [{ url: `${CDN}/MIX_2_poster_n.jpg`, width: 1080, height: 1080 }] },
          video_versions: [{ url: `${CDN}/MIX_2.mp4`, width: 1080, height: 1080, type: 101 }],
        },
      ],
    });
    const out = instagramPageMedia('https://www.instagram.com/rashmiix/p/MIX/');
    expect(out).toEqual([
      { url: `${CDN}/MIX_1_n.jpg`, kind: 'image', ext: 'jpg', width: 1440, height: 1440 },
      { url: `${CDN}/MIX_2.mp4`, kind: 'video', ext: 'mp4', width: 1080, height: 1080, poster: `${CDN}/MIX_2_poster_n.jpg` },
    ]);
  });

  it('returns [] on a profile grid (no shortcode in the URL)', () => {
    hydrate({ code: 'MIX', media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/MIX_n.jpg`, width: 1, height: 1 }] } });
    expect(instagramPageMedia('https://www.instagram.com/rashmiix/')).toEqual([]);
  });
});

describe('instagramResolver.resolve — sniffed GraphQL media', () => {
  it('resolves a scroll-loaded post from sniffed entries even with no embedded JSON', () => {
    ingestSniffedIgMedia([
      { code: 'SCROLL', kind: 'image', url: `${CDN}/SCROLL_1440_n.jpg`, ext: 'jpg', width: 1440, height: 1440 },
    ]);
    document.body.insertAdjacentHTML('beforeend', '<a href="/user/p/SCROLL/"><img id="t"></a>');
    const el = document.getElementById('t')!;
    const out = instagramResolver.resolve(u(`${CDN}/SCROLL_thumb_n.jpg`), { el, allowNetwork: false, pageUrl: 'https://www.instagram.com/user/' });
    expect(out).toEqual([{ url: `${CDN}/SCROLL_1440_n.jpg`, kind: 'image', ext: 'jpg', width: 1440, height: 1440 }]);
  });

  it('drops forged entries (a malicious page could postMessage): only IG-CDN urls survive', () => {
    ingestSniffedIgMedia([
      { code: 'EVIL', kind: 'image', url: 'https://evil.com/exfil.jpg', ext: 'jpg', width: 1, height: 1 },
      { code: 'EVIL', kind: 'image', url: 'javascript:alert(1)', ext: 'jpg' },
      { code: 'not a code!', kind: 'image', url: `${CDN}/ok_n.jpg`, ext: 'jpg' },
      { code: 'GOOD', kind: 'image', url: `${CDN}/GOOD_n.jpg`, ext: 'jpg', width: 1440, height: 1440 },
    ]);
    document.body.insertAdjacentHTML('beforeend', '<a href="/user/p/EVIL/"><img id="e"></a><a href="/user/p/GOOD/"><img id="g"></a>');
    // The evil host / scheme entries never made it into the store.
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el: document.getElementById('e')!, allowNetwork: false })).toEqual([]);
    // The valid IG-CDN entry did.
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el: document.getElementById('g')!, allowNetwork: false })).toEqual([
      { url: `${CDN}/GOOD_n.jpg`, kind: 'image', ext: 'jpg', width: 1440, height: 1440 },
    ]);
  });
});
