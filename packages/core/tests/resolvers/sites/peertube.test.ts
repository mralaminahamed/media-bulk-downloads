import { peertubeEmbedUrl } from '@mbd/core/resolvers/sites/peertube';

const UUID = '9c9de5e8-0a1e-484a-b099-e80766180a6d';
const SHORT = 'mo5vmqkuY4gELdHF6adkbf';

describe('peertubeEmbedUrl', () => {
  it.each([
    ['player embed (uuid)', `https://framatube.org/videos/embed/${UUID}`, `https://framatube.org/videos/embed/${UUID}`],
    ['player embed (shortUUID)', `https://framatube.org/videos/embed/${SHORT}`, `https://framatube.org/videos/embed/${SHORT}`],
    ['modern watch (shortUUID)', `https://framatube.org/w/${SHORT}`, `https://framatube.org/videos/embed/${SHORT}`],
    ['modern watch (uuid)', `https://framatube.org/w/${UUID}`, `https://framatube.org/videos/embed/${UUID}`],
    ['legacy watch (uuid)', `https://tube.tchncs.de/videos/watch/${UUID}`, `https://tube.tchncs.de/videos/embed/${UUID}`],
    ['arbitrary instance host', `https://video.example.coop/w/${SHORT}`, `https://video.example.coop/videos/embed/${SHORT}`],
    ['query/hash are dropped', `https://framatube.org/w/${SHORT}?start=10#t`, `https://framatube.org/videos/embed/${SHORT}`],
  ])('returns the canonical embed URL for a %s', (_label, url, want) => {
    expect(peertubeEmbedUrl(url)).toBe(want);
  });

  it.each([
    ['a playlist watch page', `https://framatube.org/w/p/${SHORT}`],
    ['the home page', 'https://framatube.org/'],
    ['a channel page', 'https://framatube.org/a/framasoft/video-channels'],
    ['an about page', 'https://framatube.org/about'],
    ['a too-short id', 'https://framatube.org/w/abc'],
    ['a slug that is not an id', 'https://framatube.org/w/my-cool-video-title'],
    ['a shortUUID with an excluded base58 char (0)', `https://framatube.org/w/mo5vmqkuY4gELdHF6adkb0`],
    ['a non-https scheme', `http://framatube.org/videos/embed/${UUID}`],
    ['a nested embed path', `https://framatube.org/videos/embed/${UUID}/extra`],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(peertubeEmbedUrl(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(peertubeEmbedUrl(new URL(`https://framatube.org/videos/watch/${UUID}`)))
      .toBe(`https://framatube.org/videos/embed/${UUID}`);
  });
});
