import { patreonPostId, patreonImagesFromHtml } from '@mbd/core/resolvers/sites/patreon';

describe('patreonPostId', () => {
  it.each([
    ['slug-<id> form', 'https://www.patreon.com/posts/building-with-142840545', '142840545'],
    ['bare /posts/<id>', 'https://www.patreon.com/posts/142840545', '142840545'],
    ['with query/hash', 'https://www.patreon.com/posts/some-title-140379361?foo=1#x', '140379361'],
    ['a subdomain host', 'https://patreon.com/posts/x-1', '1'],
  ])('extracts the post id from a %s URL', (_l, url, want) => {
    expect(patreonPostId(url)).toBe(want);
  });

  it.each([
    ['a creator page', 'https://www.patreon.com/cw/patreon'],
    ['a non-patreon host', 'https://example.com/posts/142840545'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(patreonPostId(url)).toBeNull();
  });
});

describe('patreonImagesFromHtml', () => {
  const POST = '142840545';
  const base = (hash: string, transform: string, file: string, scope = 'post', id = POST) =>
    `https://c10.patreonusercontent.com/4/patreon-media/p/${scope}/${id}/${hash}/${transform}/${file}?token-time=2145916800&token-hash=SIG_${transform}`;

  // Two renditions of the SAME post image: a width-capped 620 and the un-resized
  // original ({"a":1,"p":1}). The original must win, keeping its signed query.
  const W620 = 'eyJ3Ijo2MjB9';             // {"w":620}
  const ORIG = 'eyJhIjoxLCJwIjoxfQ==';     // {"a":1,"p":1}
  const W1920 = 'eyJ3IjoxOTIwLCJ3ZSI6MX0='; // {"w":1920,"we":1}

  it('keeps the largest rendition per image (original beats width-capped), scoped to the post', () => {
    const imgA_small = base('aaaa1111', W620, '5.png');
    const imgA_orig = base('aaaa1111', ORIG, '5.png');
    const imgB = base('bbbb2222', W1920, '1.jpg');
    const campaignAvatar = base('cccc3333', W620, '9.png', 'campaign', '14685527'); // must NOT leak
    const otherPost = base('dddd4444', ORIG, '2.png', 'post', '999999');            // must NOT leak
    const html = `<img src="${imgA_small}"><img src="${imgA_orig}"> ${imgB} avatar:${campaignAvatar} rail:${otherPost}`;

    const out = patreonImagesFromHtml(html, POST);
    const urls = out.map((c) => c.url).sort();
    expect(urls).toEqual([imgA_orig, imgB].sort());
    // The winning A rendition is the original, signed query intact.
    const a = out.find((c) => c.url.includes('aaaa1111'))!;
    expect(a).toEqual({ url: imgA_orig, kind: 'image', ext: 'png', mediaKey: 'patreon 142840545 aaaa1111/5.png' });
  });

  it('falls back to the widest width when no original ({"a":…}) rendition is shipped', () => {
    const small = base('eeee5555', W620, '3.jpg');
    const wide = base('eeee5555', W1920, '3.jpg');
    const out = patreonImagesFromHtml(`${small} ${wide}`, POST);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe(wide);
  });

  it('marks a .gif original as kind gif and skips non-image attachments', () => {
    const gif = base('ffff6666', ORIG, 'anim.gif');
    const mp4 = base('7777aaaa', ORIG, 'clip.mp4'); // video attachment — image scope only
    const out = patreonImagesFromHtml(`${gif} ${mp4}`, POST);
    expect(out.map((c) => c.kind)).toEqual(['gif']);
    expect(out.map((c) => c.url)).toEqual([gif]);
  });

  it.each([
    ['a locked/paywalled post (no post media in markup)', '<div>Unlock this post</div>'],
    ['a bad post id', 'anything'],
  ])('returns [] for %s', (_l, html) => {
    expect(patreonImagesFromHtml(html, html === 'anything' ? 'not-numeric' : POST)).toEqual([]);
  });
});
