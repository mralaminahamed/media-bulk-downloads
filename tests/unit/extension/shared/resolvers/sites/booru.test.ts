import { booruResolver } from '@/extension/shared/resolvers/sites/booru';

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
});
