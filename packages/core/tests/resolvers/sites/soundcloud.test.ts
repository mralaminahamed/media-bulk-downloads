import { soundcloudTrackUrl } from '@mbd/core/resolvers/sites/soundcloud';

describe('soundcloudTrackUrl', () => {
  it.each([
    ['a track page', 'https://soundcloud.com/artist/my-track-name', 'https://soundcloud.com/artist/my-track-name'],
    ['www host', 'https://www.soundcloud.com/artist/my-track', 'https://soundcloud.com/artist/my-track'],
    ['mobile host', 'https://m.soundcloud.com/artist/my-track', 'https://soundcloud.com/artist/my-track'],
    ['with query/hash', 'https://soundcloud.com/artist/my-track?in=x/sets/y#t=1', 'https://soundcloud.com/artist/my-track'],
    ['a track with underscores/digits', 'https://soundcloud.com/dj_2000/live_set-01', 'https://soundcloud.com/dj_2000/live_set-01'],
  ])('canonicalises a %s', (_l, url, want) => {
    expect(soundcloudTrackUrl(url)).toBe(want);
  });

  it.each([
    ['a user profile (one segment)', 'https://soundcloud.com/artist'],
    ['a playlist (/sets/)', 'https://soundcloud.com/artist/sets/my-playlist'],
    ['a user tracks collection', 'https://soundcloud.com/artist/tracks'],
    ['a user likes collection', 'https://soundcloud.com/artist/likes'],
    ['a reserved route (discover)', 'https://soundcloud.com/discover/first'],
    ['a reserved route (you)', 'https://soundcloud.com/you/library'],
    ['a search page', 'https://soundcloud.com/search/sounds'],
    ['too many segments', 'https://soundcloud.com/artist/track/extra'],
    ['a non-soundcloud host', 'https://example.com/artist/track'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(soundcloudTrackUrl(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(soundcloudTrackUrl(new URL('https://soundcloud.com/artist/track'))).toBe('https://soundcloud.com/artist/track');
  });
});
