import { imgurMediaFromHtml } from '@mbd/core/resolvers/sites/imgur';

// The page assigns a JSON *string* to window.postDataJSON, so the markup value is a
// double-encoded literal — mirror that with JSON.stringify(JSON.stringify(post)).
const wrap = (post: unknown) =>
  `<html><body><script>window.postDataJSON=${JSON.stringify(JSON.stringify(post))};</script></body></html>`;

describe('imgurMediaFromHtml', () => {
  it('reads media[] originals from window.postDataJSON, pinned to i.imgur.com', () => {
    const post = {
      id: 'ALBUM1',
      media: [
        { id: 'aaa', url: 'https://i.imgur.com/aaa.jpeg' },
        { id: 'bbb', url: 'https://i.imgur.com/bbb.mp4' },
        { id: 'ccc', url: 'https://evil.example.com/x.jpg' }, // off-CDN → dropped
      ],
    };
    expect(imgurMediaFromHtml(wrap(post))).toEqual([
      { url: 'https://i.imgur.com/aaa.jpeg', kind: 'image', ext: 'jpeg', mediaKey: 'imgur aaa' },
      { url: 'https://i.imgur.com/bbb.mp4', kind: 'video', ext: 'mp4', mediaKey: 'imgur bbb' },
    ]);
  });

  it('marks a .gif original as kind gif', () => {
    expect(imgurMediaFromHtml(wrap({ media: [{ id: 'g', url: 'https://i.imgur.com/g.gif' }] }))[0].kind).toBe('gif');
  });

  it('handles a directly-inlined object (not a JSON string)', () => {
    const html = '<script>window.postDataJSON={"media":[{"id":"z","url":"https://i.imgur.com/z.png"}]}</script>';
    expect(imgurMediaFromHtml(html)).toEqual([
      { url: 'https://i.imgur.com/z.png', kind: 'image', ext: 'png', mediaKey: 'imgur z' },
    ]);
  });

  it.each([
    ['no postDataJSON', '<div>nothing</div>'],
    ['a post with no media', wrap({ id: 'x' })],
  ])('returns [] for %s (fails closed)', (_l, html) => {
    expect(imgurMediaFromHtml(html)).toEqual([]);
  });
});
