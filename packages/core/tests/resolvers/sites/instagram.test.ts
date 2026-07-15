import { instagramResolver, instagramPageMedia, ingestSniffedIgMedia, __resetIgResolver } from '@mbd/core/resolvers/sites/instagram';

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

describe('instagramResolver.resolve — reels tab (cover-only clips)', () => {
  it('resolves a reels-grid cell (background-image inside a /reel/ link) to a pending video', () => {
    hydrate({
      code: 'RL',
      media_type: 2,
      image_versions2: { candidates: [{ url: `${CDN}/RL_cover_n.jpg`, width: 640, height: 1136 }] },
    });
    // A reels-tab cell renders its cover as a background-image inside the /reel/ link.
    document.body.insertAdjacentHTML('beforeend', '<a href="/rashmiix/reel/RL/"><div id="bg"></div></a>');
    const el = document.getElementById('bg')!;
    const out = instagramResolver.resolve(u(`${CDN}/RL_cover_n.jpg`), { el, allowNetwork: false, pageUrl: 'https://www.instagram.com/rashmiix/reels/' });

    expect(out).toEqual([
      { url: `${CDN}/RL_cover_n.jpg`, kind: 'video', ext: 'mp4', width: 640, height: 1136, poster: `${CDN}/RL_cover_n.jpg`, unresolvedVideo: true },
    ]);
  });

  it('upgrades a reel to its real mp4 once the sniffer has seen it (drops the pending cover)', () => {
    // Reels grid: cover-only pending clip.
    hydrate({ code: 'RL', media_type: 2, image_versions2: { candidates: [{ url: `${CDN}/RL_cover_n.jpg`, width: 640, height: 1136 }] } });
    // Then the reel plays/opens and its real video is sniffed for the same code.
    ingestSniffedIgMedia([
      { code: 'RL', kind: 'video', url: `${CDN}/RL_720.mp4`, ext: 'mp4', width: 720, height: 1280, poster: `${CDN}/RL_cover_n.jpg` },
    ]);
    document.body.insertAdjacentHTML('beforeend', '<a href="/rashmiix/reel/RL/"><div id="bg"></div></a>');
    const el = document.getElementById('bg')!;
    const out = instagramResolver.resolve(u(`${CDN}/RL_cover_n.jpg`), { el, allowNetwork: false });

    expect(out).toEqual([
      { url: `${CDN}/RL_720.mp4`, kind: 'video', ext: 'mp4', width: 720, height: 1280, poster: `${CDN}/RL_cover_n.jpg` },
    ]);
    expect(out[0].unresolvedVideo).toBeUndefined();
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

  it('sanitises a forged file extension — never trusts ext verbatim into the download name', () => {
    ingestSniffedIgMedia([
      { code: 'EXE', kind: 'image', url: `${CDN}/EXE_n.jpg`, ext: 'exe', width: 1440, height: 1440 },
      { code: 'TRAV', kind: 'video', url: `${CDN}/TRAV.mp4`, ext: 'a/../b', width: 720, height: 1280, poster: `${CDN}/TRAV_p.jpg` },
    ]);
    document.body.insertAdjacentHTML('beforeend', '<a href="/user/p/EXE/"><img id="x"></a><a href="/user/p/TRAV/"><img id="y"></a>');
    // 'exe' isn't a media extension → falls back to the image default 'jpg'.
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el: document.getElementById('x')!, allowNetwork: false })[0].ext).toBe('jpg');
    // path characters rejected → the video default 'mp4'.
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el: document.getElementById('y')!, allowNetwork: false })[0].ext).toBe('mp4');
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

describe('ingestSniffedIgMedia — untrusted-input validation & edge cases', () => {
  /** Resolve a post whose thumbnail sits under a /p|reel/<code> ancestor link. */
  const resolveCode = (code: string) => {
    document.body.insertAdjacentHTML('beforeend', `<a href="/user/p/${code}/"><img id="${code}"></a>`);
    return instagramResolver.resolve(u(`${CDN}/thumb_n.jpg`), { el: document.getElementById(code)!, allowNetwork: false });
  };

  it('ignores a non-array payload without throwing, and stores nothing', () => {
    ingestSniffedIgMedia('not-an-array');
    ingestSniffedIgMedia(null);
    ingestSniffedIgMedia(undefined);
    ingestSniffedIgMedia({ code: 'X' });
    expect(resolveCode('NADA')).toEqual([]);
  });

  it('skips null / primitive / wrong-kind entries and keeps the valid one', () => {
    ingestSniffedIgMedia([
      null,
      'a string',
      42,
      { code: 'AUD', kind: 'audio', url: `${CDN}/aud_n.jpg`, ext: 'jpg' }, // kind not image|video -> dropped
      { code: 'OK', kind: 'image', url: `${CDN}/OK_1440_n.jpg`, ext: 'jpg', width: 1440, height: 1440 },
    ]);
    expect(resolveCode('OK')).toEqual([{ url: `${CDN}/OK_1440_n.jpg`, kind: 'image', ext: 'jpg', width: 1440, height: 1440 }]);
    expect(resolveCode('AUD')).toEqual([]); // the audio-kind entry never entered the store
  });

  it('defaults a missing ext to jpg and surfaces an entry with no width/height without dimension fields', () => {
    // No ext and no width/height on the sniffed entry — exercises both defaulting paths.
    ingestSniffedIgMedia([{ code: 'NOWH', kind: 'image', url: `${CDN}/NOWH_n.jpg` }]);
    const [c] = resolveCode('NOWH');
    expect(c).toEqual({ url: `${CDN}/NOWH_n.jpg`, kind: 'image', ext: 'jpg' });
    expect(c.width).toBeUndefined();
    expect(c.height).toBeUndefined();
  });

  it('honours a sniffed pending flag -> a cover-only pending video', () => {
    ingestSniffedIgMedia([
      { code: 'PEND', kind: 'video', url: `${CDN}/PEND_cover_n.jpg`, ext: 'mp4', width: 640, height: 1136, poster: `${CDN}/PEND_cover_n.jpg`, pending: true },
    ]);
    const [c] = resolveCode('PEND');
    expect(c).toMatchObject({ kind: 'video', ext: 'mp4', unresolvedVideo: true, poster: `${CDN}/PEND_cover_n.jpg` });
  });

  it('when every sniffed entry is rejected (host-pinning), the store stays empty (no crash)', () => {
    ingestSniffedIgMedia([
      { code: 'EVIL', kind: 'image', url: 'https://evil.com/x.jpg', ext: 'jpg' },
      { code: 'EVIL', kind: 'image', url: 'javascript:alert(1)', ext: 'jpg' },
    ]);
    expect(resolveCode('EVIL')).toEqual([]);
  });

  it('bounds the sniffed store to its cap (newest entries win)', () => {
    const many = Array.from({ length: 4001 }, (_, i) => ({
      code: 'MANY', kind: 'image', url: `${CDN}/MANY_${i}_n.jpg`, ext: 'jpg', width: 1440, height: 1440,
    }));
    ingestSniffedIgMedia(many);
    const out = resolveCode('MANY');
    expect(out).toHaveLength(4000); // 4001 ingested, capped to the last 4000
    expect(out[out.length - 1].url).toBe(`${CDN}/MANY_4000_n.jpg`);
  });
});

describe('instagram buildByCode + instagramPageMedia — parsing edge cases', () => {
  it('skips script blocks with no media token and invalid-JSON blocks, keeping the good post', () => {
    // (a) valid JSON, but no media tokens -> cheap-guard skip
    hydrate({ hello: 'world', nested: { a: 1 } });
    // (b) mentions the token substring but is NOT valid JSON -> JSON.parse throws, swallowed
    const bad = document.createElement('script');
    bad.type = 'application/json';
    bad.textContent = 'this mentions image_versions2 but is not valid json {';
    document.body.appendChild(bad);
    // (c) a genuine post — the good path must still resolve
    hydrate({ code: 'GOODJSON', media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/GOODJSON_n.jpg`, width: 1080, height: 1080 }] } });

    document.body.insertAdjacentHTML('beforeend', '<a href="/user/p/GOODJSON/"><img id="t"></a>');
    const el = document.getElementById('t')!;
    const expected = [{ url: `${CDN}/GOODJSON_n.jpg`, kind: 'image', ext: 'jpg', width: 1080, height: 1080 }];
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el, allowNetwork: false })).toEqual(expected);
    // A second resolve (e.g. deep-scan re-run) must not re-parse the same <script>
    // nodes — each is parsed exactly once — yet still return the same media.
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el, allowNetwork: false })).toEqual(expected);
  });

  it('dedups the same code+url reached from both embedded JSON and a sniffed entry', () => {
    const dupUrl = `${CDN}/DUP_1440_n.jpg`;
    hydrate({ code: 'DUP', media_type: 1, image_versions2: { candidates: [{ url: dupUrl, width: 1440, height: 1440 }] } });
    ingestSniffedIgMedia([{ code: 'DUP', kind: 'image', url: dupUrl, ext: 'jpg', width: 1440, height: 1440 }]);
    document.body.insertAdjacentHTML('beforeend', '<a href="/user/p/DUP/"><img id="t"></a>');
    expect(instagramResolver.resolve(u(`${CDN}/t.jpg`), { el: document.getElementById('t')!, allowNetwork: false })).toHaveLength(1);
  });

  it('bounds the parsed store to its cap (a huge carousel is sliced to the newest entries)', () => {
    const carousel_media = Array.from({ length: 4001 }, (_, i) => ({
      media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/CAP_${i}_n.jpg`, width: 1440, height: 1440 }] },
    }));
    hydrate({ code: 'CAP', media_type: 8, carousel_media });
    expect(instagramPageMedia('https://www.instagram.com/rashmiix/p/CAP/')).toHaveLength(4000);
  });

  it('instagramPageMedia returns [] when the URL has a shortcode but no media is known for it', () => {
    hydrate({ code: 'OTHER', media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/OTHER_n.jpg`, width: 1, height: 1 }] } });
    expect(instagramPageMedia('https://www.instagram.com/rashmiix/p/UNKNOWN/')).toEqual([]);
  });
});

describe('Bug fix: push loop handles very large arrays (no RangeError)', () => {
  // Both `sniffed` (ingestSniffedIgMedia) and `parsed` (hydration parsing) are
  // built with a loop, not `push(...items)`: `items` can be arbitrarily large
  // (untrusted page data / a huge carousel's hydration JSON), and spreading it
  // as call args risks a RangeError that the caller's try/catch would silently
  // swallow. Prove a single call with 200,000 entries doesn't throw either path.
  it('ingestSniffedIgMedia ingests 200,000 entries in one call without throwing', () => {
    const many = Array.from({ length: 200_000 }, (_, i) => ({
      code: 'BIGCODE', kind: 'image' as const, url: `${CDN}/HUGE_${i}_n.jpg`, ext: 'jpg', width: 10, height: 10,
    }));
    expect(() => ingestSniffedIgMedia(many)).not.toThrow();
    expect(instagramPageMedia('https://www.instagram.com/x/p/BIGCODE/').some((c) => c.url === `${CDN}/HUGE_199999_n.jpg`)).toBe(true);
  });

  it('a carousel hydration with 200,000 slides parses in one call without throwing', () => {
    const carousel_media = Array.from({ length: 200_000 }, (_, i) => ({
      media_type: 1, image_versions2: { candidates: [{ url: `${CDN}/BIGCAP_${i}_n.jpg`, width: 1440, height: 1440 }] },
    }));
    hydrate({ code: 'BIGCAP', media_type: 8, carousel_media });
    expect(() => instagramPageMedia('https://www.instagram.com/x/p/BIGCAP/')).not.toThrow();
    expect(instagramPageMedia('https://www.instagram.com/x/p/BIGCAP/')).toHaveLength(4000); // capped, newest kept
  });
});
