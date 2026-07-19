import { tiktokMediaFromJson } from '@mbd/core/resolvers/sites/tiktok';

// Minimal shape of the __UNIVERSAL_DATA_FOR_REHYDRATION__ payload's video-detail scope.
const universal = (itemStruct: unknown) =>
  JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct } } } });

describe('tiktokMediaFromJson — video', () => {
  it('returns the highest-bitrate rendition as a ready mp4, poster from cover', () => {
    const json = universal({
      id: '7300000000000000001',
      video: {
        cover: 'https://p16-sign.tiktokcdn-us.com/cover~tplv.jpeg',
        playAddr: 'https://v16-webapp-prime.us.tiktok.com/default.mp4',
        bitrateInfo: [
          { Bitrate: 500000, PlayAddr: { UrlList: ['https://v16-webapp-prime.us.tiktok.com/sd.mp4'] } },
          { Bitrate: 2000000, PlayAddr: { UrlList: ['https://v16-webapp-prime.us.tiktok.com/hd.mp4'] } },
        ],
      },
    });
    const out = tiktokMediaFromJson(json);
    expect(out).toEqual([{
      url: 'https://v16-webapp-prime.us.tiktok.com/hd.mp4',
      kind: 'video', ext: 'mp4',
      mediaKey: 'tiktok 7300000000000000001',
      poster: 'https://p16-sign.tiktokcdn-us.com/cover~tplv.jpeg',
    }]);
  });

  it('falls back to the default playAddr when there is no bitrateInfo', () => {
    const json = universal({ id: '1', video: { playAddr: 'https://v19.tiktokcdn.com/x.mp4' } });
    expect(tiktokMediaFromJson(json)[0].url).toBe('https://v19.tiktokcdn.com/x.mp4');
  });

  it('rejects a playAddr on a non-TikTok host (untrusted JSON)', () => {
    const json = universal({ id: '1', video: { playAddr: 'https://evil.example/x.mp4', bitrateInfo: [
      { Bitrate: 1, PlayAddr: { UrlList: ['https://evil.example/hd.mp4'] } },
    ] } });
    expect(tiktokMediaFromJson(json)).toEqual([]);
  });

  it('rejects an http (non-https) playAddr', () => {
    const json = universal({ id: '1', video: { playAddr: 'http://v16.tiktokcdn.com/x.mp4' } });
    expect(tiktokMediaFromJson(json)).toEqual([]);
  });
});

describe('tiktokMediaFromJson — photo mode', () => {
  it('returns one image candidate per slide', () => {
    const json = universal({
      id: '7300000000000000002',
      imagePost: { images: [
        { imageURL: { urlList: ['https://p16.tiktokcdn.com/img0.jpeg', 'https://p16.tiktokcdn.com/img0-fallback.jpeg'] } },
        { imageURL: { urlList: ['https://p16.tiktokcdn.com/img1.jpeg'] } },
      ] },
    });
    const out = tiktokMediaFromJson(json);
    expect(out).toEqual([
      { url: 'https://p16.tiktokcdn.com/img0.jpeg', kind: 'image', mediaKey: 'tiktok 7300000000000000002 0' },
      { url: 'https://p16.tiktokcdn.com/img1.jpeg', kind: 'image', mediaKey: 'tiktok 7300000000000000002 1' },
    ]);
  });
});

describe('tiktokMediaFromJson — fail-closed', () => {
  it.each([
    ['empty/undefined', undefined],
    ['blank', '   '],
    ['malformed JSON', '{not json'],
    ['no video-detail scope', JSON.stringify({ __DEFAULT_SCOPE__: {} })],
    ['no itemStruct (private/removed)', universal(undefined)],
    ['itemStruct with neither video nor images', universal({ id: '1' })],
  ])('returns [] for %s', (_label, input) => {
    expect(tiktokMediaFromJson(input as string | undefined)).toEqual([]);
  });
});
