import { isPexelsMediaPage, pexelsMediaFromNextData } from '@mbd/core/resolvers/sites/pexels';

describe('isPexelsMediaPage', () => {
  it.each([
    ['a photo page', 'https://www.pexels.com/photo/a-cat-12345/', true],
    ['a video page', 'https://www.pexels.com/video/clip-99/', true],
    ['a search page', 'https://www.pexels.com/search/cats/', false],
    ['a non-pexels host', 'https://example.com/photo/x-1/', false],
  ])('%s → %s', (_l, url, want) => {
    expect(isPexelsMediaPage(url)).toBe(want);
  });
});

describe('pexelsMediaFromNextData', () => {
  const nd = (medium: unknown) => JSON.stringify({ props: { pageProps: { medium } } });

  it('reads a photo download_link, pinned to the pexels CDN', () => {
    const link = 'https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?cs=srgb&dl=cat.jpg&fm=jpg';
    expect(pexelsMediaFromNextData(nd({ id: 12345, image: { download_link: link } }))).toEqual([
      { url: link, kind: 'image', ext: 'jpeg', mediaKey: 'pexels 12345' },
    ]);
  });

  it('prefers a video download_link over the poster image', () => {
    const text = nd({
      id: 99,
      video: { download_link: 'https://videos.pexels.com/video-files/99/clip.mp4' },
      image: { download_link: 'https://images.pexels.com/x.jpg' },
    });
    expect(pexelsMediaFromNextData(text)[0]).toEqual({
      url: 'https://videos.pexels.com/video-files/99/clip.mp4',
      kind: 'video',
      ext: 'mp4',
      mediaKey: 'pexels 99',
    });
  });

  it('drops off-CDN links and returns [] when no medium is embedded', () => {
    expect(pexelsMediaFromNextData(nd({ id: 1, image: { download_link: 'https://evil.com/x.jpg' } }))).toEqual([]);
    expect(pexelsMediaFromNextData(JSON.stringify({ props: {} }))).toEqual([]);
  });
});
