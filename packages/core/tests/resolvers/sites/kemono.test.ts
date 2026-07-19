import { kemonoPostRef, kemonoMediaFromHtml } from '@mbd/core/resolvers/sites/kemono';

describe('kemonoPostRef', () => {
  it.each([
    [
      'kemono.su patreon post',
      'https://kemono.su/patreon/user/12345/post/98765',
      { host: 'kemono.su', service: 'patreon', creatorId: '12345', postId: '98765' },
    ],
    [
      'coomer.st onlyfans post',
      'https://coomer.st/onlyfans/user/creator/post/abc',
      { host: 'coomer.st', service: 'onlyfans', creatorId: 'creator', postId: 'abc' },
    ],
    [
      'www + query',
      'https://www.kemono.party/fanbox/user/9/post/1?x=1',
      { host: 'www.kemono.party', service: 'fanbox', creatorId: '9', postId: '1' },
    ],
  ])('parses a %s', (_l, url, want) => {
    expect(kemonoPostRef(url)).toEqual(want);
  });

  it.each([
    ['a creator page (no /post/)', 'https://kemono.su/patreon/user/12345'],
    ['an unknown host', 'https://kemono.example.com/patreon/user/1/post/2'],
    ['a non-kemono TLD', 'https://kemono.io/patreon/user/1/post/2'],
  ])('returns null for %s', (_l, url) => {
    expect(kemonoPostRef(url)).toBeNull();
  });
});

describe('kemonoMediaFromHtml', () => {
  const ref = { host: 'kemono.su', service: 'patreon', creatorId: '12345', postId: '98765' };

  it("surfaces this post's /data/ files+attachments, skipping thumbnails and off-host URLs", () => {
    const html = `
      <a class="fileThumb" href="https://kemono.su/data/ab/cd/hash1.jpg?f=first.jpg">
        <img src="https://img.kemono.su/thumbnail/data/ab/cd/hash1.jpg"></a>
      <div class="post__content"><img src="https://kemono.su/data/ef/gh/hash2.png"></div>
      <a class="post__attachment-link" href="https://kemono.su/data/ij/kl/hash3.mp4?f=video.mp4">Download</a>
      <a href="https://other.example.com/data/xx/leak.jpg">leak</a>`;
    expect(kemonoMediaFromHtml(html, ref)).toEqual([
      { url: 'https://kemono.su/data/ab/cd/hash1.jpg?f=first.jpg', kind: 'image', ext: 'jpg', mediaKey: 'kemono 98765 hash1.jpg' },
      { url: 'https://kemono.su/data/ef/gh/hash2.png', kind: 'image', ext: 'png', mediaKey: 'kemono 98765 hash2.png' },
      { url: 'https://kemono.su/data/ij/kl/hash3.mp4?f=video.mp4', kind: 'video', ext: 'mp4', mediaKey: 'kemono 98765 hash3.mp4' },
    ]);
  });

  it('derives kind/ext from the ?f= filename when the data path has no extension', () => {
    const html = '<a href="https://coomer.su/data/aa/bb/deadbeef?f=picture.jpeg">x</a>';
    expect(kemonoMediaFromHtml(html, { host: 'coomer.su', service: 'onlyfans', creatorId: 'c', postId: '5' })).toEqual([
      { url: 'https://coomer.su/data/aa/bb/deadbeef?f=picture.jpeg', kind: 'image', ext: 'jpeg', mediaKey: 'kemono 5 deadbeef' },
    ]);
  });

  it('skips non-media attachments (archives) and dedups by path', () => {
    const html = `
      <a href="https://kemono.su/data/z/archive.zip?f=pack.zip">zip</a>
      <a href="https://kemono.su/data/z/dup.jpg?f=a.jpg">a</a>
      <a href="https://kemono.su/data/z/dup.jpg?f=b.jpg">b</a>`;
    expect(kemonoMediaFromHtml(html, ref).map((c) => c.url)).toEqual(['https://kemono.su/data/z/dup.jpg?f=a.jpg']);
  });

  it('returns [] for a post with no /data/ links (locked/removed)', () => {
    expect(kemonoMediaFromHtml('<div>This post is unavailable</div>', ref)).toEqual([]);
  });
});
