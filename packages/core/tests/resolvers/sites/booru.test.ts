import { booruResolver } from '@mbd/core/resolvers/sites/booru';

const PAGE = { danbooru: 'https://danbooru.donmai.us/posts/12345', gel: 'https://gelbooru.com/index.php?page=post&s=view&id=1', yan: 'https://yande.re/post/show/1' };
const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });

describe('booruResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches on the PAGE host, not the media host', () => {
    const u = new URL('https://cdn.donmai.us/preview/ab/cd/abcd.jpg'); // media host, not a booru page host
    expect(booruResolver.match(u, ctx(undefined, PAGE.danbooru))).toBe(true);
    expect(booruResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
    expect(booruResolver.match(u, { allowNetwork: false })).toBe(false); // no pageUrl
  });

  it('Danbooru grid: reads data-file-url + dims + mediaKey from the article', () => {
    const art = document.createElement('article');
    art.className = 'post-preview';
    art.setAttribute('data-file-url', 'https://cdn.donmai.us/original/ab/cd/abcd.png');
    art.setAttribute('data-width', '2000');
    art.setAttribute('data-height', '3000');
    art.setAttribute('data-id', '12345');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://cdn.donmai.us/preview/ab/cd/abcd.jpg');
    art.appendChild(img);
    document.body.appendChild(art);
    const [c] = booruResolver.resolve(new URL('https://cdn.donmai.us/preview/ab/cd/abcd.jpg'), ctx(img, PAGE.danbooru));
    expect(c.url).toBe('https://cdn.donmai.us/original/ab/cd/abcd.png');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('png');
    expect(c.thumbnailSrc).toBe('https://cdn.donmai.us/preview/ab/cd/abcd.jpg');
    expect(c.width).toBe(2000);
    expect(c.height).toBe(3000);
    expect(c.mediaKey).toBe('booru danbooru.donmai.us 12345');
  });

  it('Danbooru: falls back to data-large-file-url when only that attr is present', () => {
    const art = document.createElement('article');
    art.className = 'post-preview';
    art.setAttribute('data-large-file-url', 'https://cdn.donmai.us/original/ab/cd/big.png');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://cdn.donmai.us/preview/ab/cd/big.jpg');
    art.appendChild(img);
    document.body.appendChild(art);
    const [c] = booruResolver.resolve(new URL('https://cdn.donmai.us/preview/ab/cd/big.jpg'), ctx(img, PAGE.danbooru));
    expect(c.url).toBe('https://cdn.donmai.us/original/ab/cd/big.png');
    expect(c.ext).toBe('png');
  });

  it('Danbooru post: reads data-file-url on #image', () => {
    const img = document.createElement('img');
    img.id = 'image';
    img.setAttribute('data-file-url', 'https://cdn.donmai.us/original/ab/cd/abcd.jpg');
    img.setAttribute('src', 'https://cdn.donmai.us/sample/ab/cd/sample-abcd.jpg');
    document.body.appendChild(img);
    const [c] = booruResolver.resolve(new URL('https://cdn.donmai.us/sample/ab/cd/sample-abcd.jpg'), ctx(img, PAGE.danbooru));
    expect(c.url).toBe('https://cdn.donmai.us/original/ab/cd/abcd.jpg');
  });

  it('Moebooru post: reads the original-file link when el is #image', () => {
    const link = document.createElement('a');
    link.className = 'original-file-unchanged';
    link.setAttribute('href', 'https://files.yande.re/image/hash/yande.re%201%20tag.png');
    document.body.appendChild(link);
    const img = document.createElement('img');
    img.id = 'image';
    img.setAttribute('src', 'https://assets.yande.re/data/sample/hash.jpg');
    document.body.appendChild(img);
    const [c] = booruResolver.resolve(new URL('https://assets.yande.re/data/sample/hash.jpg'), ctx(img, PAGE.yan));
    expect(c.url).toBe('https://files.yande.re/image/hash/yande.re%201%20tag.png');
    expect(c.ext).toBe('png');
  });

  it('Gelbooru post: reads the host-pinned /images/ original link when el is #image', () => {
    const link = document.createElement('a');
    link.setAttribute('href', 'https://img3.gelbooru.com/images/ab/cd/hash.jpeg');
    link.textContent = 'Original image';
    document.body.appendChild(link);
    const img = document.createElement('img');
    img.id = 'image';
    img.setAttribute('src', 'https://gelbooru.com/samples/ab/cd/sample_hash.jpg');
    document.body.appendChild(img);
    const [c] = booruResolver.resolve(new URL('https://gelbooru.com/samples/ab/cd/sample_hash.jpg'), ctx(img, PAGE.gel));
    expect(c.url).toBe('https://img3.gelbooru.com/images/ab/cd/hash.jpeg');
  });

  it('detects video kind from a webm/mp4 original', () => {
    const art = document.createElement('article');
    art.setAttribute('data-file-url', 'https://cdn.donmai.us/original/ab/cd/clip.webm');
    const img = document.createElement('img');
    art.appendChild(img);
    document.body.appendChild(art);
    const [c] = booruResolver.resolve(new URL('https://cdn.donmai.us/preview/ab/cd/clip.jpg'), ctx(img, PAGE.danbooru));
    expect(c.kind).toBe('video');
    expect(c.ext).toBe('webm');
  });

  it('rejects an off-host original (host-pin) and returns []', () => {
    const art = document.createElement('article');
    art.setAttribute('data-file-url', 'https://evil.example.com/steal.jpg');
    const img = document.createElement('img');
    art.appendChild(img);
    document.body.appendChild(art);
    expect(booruResolver.resolve(new URL('https://cdn.donmai.us/preview/ab/cd/x.jpg'), ctx(img, PAGE.danbooru))).toEqual([]);
  });

  it('returns [] on a Gelbooru grid thumb (no original in DOM)', () => {
    const a = document.createElement('a');
    a.setAttribute('href', 'https://gelbooru.com/index.php?page=post&s=view&id=1'); // post link, not /images/
    const img = document.createElement('img');
    img.setAttribute('src', 'https://gelbooru.com/thumbnails/ab/cd/thumbnail_hash.jpg');
    a.appendChild(img);
    document.body.appendChild(a);
    expect(booruResolver.resolve(new URL('https://gelbooru.com/thumbnails/ab/cd/thumbnail_hash.jpg'), ctx(img, 'https://gelbooru.com/index.php?page=post&s=list'))).toEqual([]);
  });

  it('does not attach a post original to an unrelated image (el is not #image)', () => {
    const link = document.createElement('a');
    link.className = 'original-file-unchanged';
    link.setAttribute('href', 'https://files.yande.re/image/hash/x.png');
    document.body.appendChild(link);
    const icon = document.createElement('img'); // an avatar/icon, NOT #image
    icon.setAttribute('src', 'https://assets.yande.re/assets/icon.png');
    document.body.appendChild(icon);
    expect(booruResolver.resolve(new URL('https://assets.yande.re/assets/icon.png'), ctx(icon, PAGE.yan))).toEqual([]);
  });

  // e621ng (Danbooru fork): the original lives in `data-file-url` on the
  // `#image-container` section that wraps the post <img>, so the Danbooru
  // branch reaches it via `el.closest('[data-file-url]')`. Verified live on
  // e926.net (2026-07-15): `#image-container[data-file-url]` → static1.<host>.
  it('e621 (Danbooru fork): reads data-file-url from #image-container, pins to e621.net', () => {
    const container = document.createElement('section');
    container.id = 'image-container';
    container.setAttribute('data-file-url', 'https://static1.e621.net/data/ab/cd/abcdef.png');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://static1.e621.net/data/sample/ab/cd/sample-abcdef.jpg');
    container.appendChild(img);
    document.body.appendChild(container);
    const [c] = booruResolver.resolve(new URL('https://static1.e621.net/data/sample/ab/cd/sample-abcdef.jpg'), ctx(img, 'https://e621.net/posts/12345'));
    expect(c.url).toBe('https://static1.e621.net/data/ab/cd/abcdef.png');
    expect(c.ext).toBe('png');
    expect(c.thumbnailSrc).toBe('https://static1.e621.net/data/sample/ab/cd/sample-abcdef.jpg');
  });

  it('e926 (SFW e621 twin): same path detects a webm original and pins to e926.net', () => {
    const container = document.createElement('section');
    container.id = 'image-container';
    container.setAttribute('data-file-url', 'https://static1.e926.net/data/ab/cd/clip.webm');
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);
    const [c] = booruResolver.resolve(new URL('https://static1.e926.net/data/preview/ab/cd/clip.jpg'), ctx(img, 'https://e926.net/posts/1'));
    expect(c.url).toBe('https://static1.e926.net/data/ab/cd/clip.webm');
    expect(c.kind).toBe('video');
    expect(c.ext).toBe('webm');
  });

  // Gelbooru-0.2 self-hosted family (rule34.xxx / tbib / hypnohub / xbooru /
  // realbooru): same `#image` + "Original image" `/images/` anchor as the
  // existing gelbooru.com/safebooru.org branch, pinned to the site's own domain.
  it('rule34.xxx (Gelbooru-0.2): reads host-pinned /images/ original when el is #image', () => {
    const link = document.createElement('a');
    link.setAttribute('href', 'https://wimg.rule34.xxx/images/ab/cd/hash.jpeg');
    link.textContent = 'Original image';
    document.body.appendChild(link);
    const img = document.createElement('img');
    img.id = 'image';
    img.setAttribute('src', 'https://wimg.rule34.xxx/samples/ab/cd/sample_hash.jpg');
    document.body.appendChild(img);
    const [c] = booruResolver.resolve(new URL('https://wimg.rule34.xxx/samples/ab/cd/sample_hash.jpg'), ctx(img, 'https://rule34.xxx/index.php?page=post&s=view&id=1'));
    expect(c.url).toBe('https://wimg.rule34.xxx/images/ab/cd/hash.jpeg');
  });

  it('fail-safe host-pin: an e621 page whose data-file-url points off-domain returns []', () => {
    const container = document.createElement('section');
    container.id = 'image-container';
    container.setAttribute('data-file-url', 'https://evil.example.com/steal.png');
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);
    expect(booruResolver.resolve(new URL('https://static1.e621.net/data/preview/x.jpg'), ctx(img, 'https://e621.net/posts/1'))).toEqual([]);
  });

  // Philomena engine (derpibooru / furbooru / ponybooru) + booru-on-rails
  // (twibooru): the renditions live in an entity-encoded JSON `data-uris` on the
  // media container wrapping the post/grid image; the `full` key is the full-res
  // URL. Verified live 2026-07-15 — CDN hosts differ per site (derpicdn.net,
  // furrycdn.org, cdn.ponybooru.org, cdn.twibooru.org), so each is host-pinned.
  it('Philomena (derpibooru): reads data-uris.full, pins to derpicdn.net', () => {
    const container = document.createElement('div');
    container.className = 'image-show-container';
    container.setAttribute('data-uris', JSON.stringify({
      full: 'https://derpicdn.net/img/view/2012/1/2/1.png',
      large: 'https://derpicdn.net/img/2012/1/2/1/large.png',
      thumb: 'https://derpicdn.net/img/2012/1/2/1/thumb.png',
    }));
    const img = document.createElement('img');
    img.setAttribute('src', 'https://derpicdn.net/img/2012/1/2/1/thumb.png');
    container.appendChild(img);
    document.body.appendChild(container);
    const [c] = booruResolver.resolve(new URL('https://derpicdn.net/img/2012/1/2/1/thumb.png'), ctx(img, 'https://derpibooru.org/images/1'));
    expect(c.url).toBe('https://derpicdn.net/img/view/2012/1/2/1.png');
    expect(c.ext).toBe('png');
    expect(c.thumbnailSrc).toBe('https://derpicdn.net/img/2012/1/2/1/thumb.png');
  });

  it('Philomena (furbooru): pins to furrycdn.org and detects a webm video', () => {
    const container = document.createElement('div');
    container.className = 'image-show-container';
    container.setAttribute('data-uris', JSON.stringify({ full: 'https://furrycdn.org/img/view/2020/4/24/1.webm' }));
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);
    const [c] = booruResolver.resolve(new URL('https://furrycdn.org/img/2020/4/24/1/thumb.gif'), ctx(img, 'https://furbooru.org/images/1'));
    expect(c.url).toBe('https://furrycdn.org/img/view/2020/4/24/1.webm');
    expect(c.kind).toBe('video');
    expect(c.ext).toBe('webm');
  });

  it('Philomena (twibooru, booru-on-rails): reads data-uris.full pinned to twibooru.org', () => {
    const container = document.createElement('div');
    container.className = 'image-show-container';
    container.setAttribute('data-uris', JSON.stringify({ full: 'https://cdn.twibooru.org/img/2020/7/8/1/full.png' }));
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);
    // post URL has no /images/ prefix on twibooru
    const [c] = booruResolver.resolve(new URL('https://cdn.twibooru.org/img/2020/7/8/1/thumb.png'), ctx(img, 'https://twibooru.org/1'));
    expect(c.url).toBe('https://cdn.twibooru.org/img/2020/7/8/1/full.png');
  });

  it('Philomena: the data-uris container reached via el.closest (grid thumb)', () => {
    const container = document.createElement('div');
    container.className = 'media-box';
    container.setAttribute('data-uris', JSON.stringify({ full: 'https://cdn.ponybooru.org/img/view/2020/7/5/1.png' }));
    const inner = document.createElement('div');
    const img = document.createElement('img');
    inner.appendChild(img);
    container.appendChild(inner);
    document.body.appendChild(container);
    const [c] = booruResolver.resolve(new URL('https://cdn.ponybooru.org/img/2020/7/5/1/thumb.png'), ctx(img, 'https://ponybooru.org/images/1'));
    expect(c.url).toBe('https://cdn.ponybooru.org/img/view/2020/7/5/1.png');
  });

  it('Philomena fail-safe: an off-domain data-uris.full is rejected -> []', () => {
    const container = document.createElement('div');
    container.className = 'image-show-container';
    container.setAttribute('data-uris', JSON.stringify({ full: 'https://evil.example.com/steal.png' }));
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);
    expect(booruResolver.resolve(new URL('https://derpicdn.net/img/thumb.png'), ctx(img, 'https://derpibooru.org/images/1'))).toEqual([]);
  });

  it('Philomena fail-safe: malformed data-uris JSON returns [] (no throw)', () => {
    const container = document.createElement('div');
    container.className = 'image-show-container';
    container.setAttribute('data-uris', '{not valid json');
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);
    expect(booruResolver.resolve(new URL('https://derpicdn.net/img/thumb.png'), ctx(img, 'https://derpibooru.org/images/1'))).toEqual([]);
  });
});
