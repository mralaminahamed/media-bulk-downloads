import { fapelloPostRef, fapelloMediaFromHtml } from '@mbd/core/resolvers/sites/fapello';

describe('fapelloPostRef', () => {
  it.each([
    ['.com post', 'https://fapello.com/some-model/12345/', { model: 'some-model', id: '12345' }],
    ['.su post', 'https://fapello.su/model_2/9/', { model: 'model_2', id: '9' }],
    ['no trailing slash', 'https://fapello.com/a-b.c/7', { model: 'a-b.c', id: '7' }],
  ])('parses a %s', (_l, url, want) => {
    expect(fapelloPostRef(url)).toEqual(want);
  });

  it.each([
    ['a model listing (no id)', 'https://fapello.com/some-model/'],
    ['a category pagination', 'https://fapello.com/videos/2/'],
    ['a non-fapello host', 'https://example.com/model/1/'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(fapelloPostRef(url)).toBeNull();
  });
});

describe('fapelloMediaFromHtml', () => {
  const ref = { model: 'some-model', id: '12345' };

  it('surfaces the image, stripping the .md size suffix to the original', () => {
    const html =
      '<div class="uk-align-center"><a href="#"><img src="https://cdn.fapello.com/content/s/o/some-model/1000/x_0001.md.jpg"></a></div>';
    expect(fapelloMediaFromHtml(html, ref)).toEqual([
      { url: 'https://cdn.fapello.com/content/s/o/some-model/1000/x_0001.jpg', kind: 'image', ext: 'jpg', mediaKey: 'fapello some-model 12345' },
    ]);
  });

  it('surfaces a video with its poster', () => {
    const html =
      '<div class="uk-align-center"><video type="video" poster="https://cdn.fapello.com/p.jpg"><source src="https://cdn.fapello.com/v/some-model/clip.mp4"></video></div>';
    expect(fapelloMediaFromHtml(html, ref)).toEqual([
      { url: 'https://cdn.fapello.com/v/some-model/clip.mp4', kind: 'video', ext: 'mp4', poster: 'https://cdn.fapello.com/p.jpg', mediaKey: 'fapello some-model 12345' },
    ]);
  });

  it('returns [] when there is no uk-align-center media block (listing/inaccessible)', () => {
    expect(fapelloMediaFromHtml('<div>no media here</div>', ref)).toEqual([]);
  });
});
