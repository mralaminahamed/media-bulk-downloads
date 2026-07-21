// @vitest-environment jsdom
import { okruVideoId, okruMediaFromOptions, okruPageMedia } from '@mbd/core/resolvers/sites/odnoklassniki';

describe('okruVideoId', () => {
  it.each([
    ['/video/<id>', 'https://ok.ru/video/219222312291', '219222312291'],
    ['a mobile host', 'https://m.ok.ru/video/2990795590302', '2990795590302'],
    ['a /videoembed/ url', 'https://ok.ru/videoembed/13122021624320?nochat=1', '13122021624320'],
    ['a trailing state query', 'https://m.ok.ru/video/4935104596685?st._aid=x', '4935104596685'],
  ])('extracts the id from %s', (_l, url, want) => {
    expect(okruVideoId(url)).toBe(want);
  });

  it('returns null for a non-ok host', () => {
    expect(okruVideoId('https://example.com/video/123')).toBeNull();
  });

  it('returns null for a non-video ok path', () => {
    expect(okruVideoId('https://ok.ru/group/123')).toBeNull();
  });
});

describe('okruMediaFromOptions', () => {
  const opts = (metadata: unknown) =>
    JSON.stringify({ flashvars: { metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata) } });

  const meta = {
    videos: [
      { name: 'mobile', url: 'https://vd1.okcdn.ru/?id=mobile' },
      { name: 'hd', url: 'https://vd1.okcdn.ru/?id=hd' },
      { name: 'full', url: 'https://vd1.okcdn.ru/?id=full' },
      { name: 'sd', url: 'https://vd1.okcdn.ru/?id=sd' },
    ],
    hlsManifestUrl: 'https://vd1.okcdn.ru/video.m3u8',
  };

  it('surfaces the highest-quality progressive mp4, pinned to okcdn.ru', () => {
    expect(okruMediaFromOptions(opts(meta), '219222312291')).toEqual([
      { url: 'https://vd1.okcdn.ru/?id=full', kind: 'video', ext: 'mp4', mediaKey: 'okru 219222312291' },
    ]);
  });

  it('accepts metadata already parsed as an object (not a JSON string)', () => {
    expect(okruMediaFromOptions(opts(meta as unknown as string), '1')[0].url).toBe('https://vd1.okcdn.ru/?id=full');
    const asObject = JSON.stringify({ flashvars: { metadata: meta } });
    expect(okruMediaFromOptions(asObject, '1')[0].url).toBe('https://vd1.okcdn.ru/?id=full');
  });

  it('accepts a mycdn.me video host', () => {
    const m = { videos: [{ name: 'hd', url: 'https://vsd123.mycdn.me/?id=hd' }] };
    expect(okruMediaFromOptions(opts(m), '1')[0].url).toBe('https://vsd123.mycdn.me/?id=hd');
  });

  it('drops off-CDN urls and returns [] with no usable source', () => {
    const evil = { videos: [{ name: 'full', url: 'https://evil.com/x.mp4' }] };
    expect(okruMediaFromOptions(opts(evil), '1')).toEqual([]);
  });

  it('returns [] on a live-only page (no progressive videos, hls only)', () => {
    expect(okruMediaFromOptions(opts({ hlsManifestUrl: 'https://vd1.okcdn.ru/live.m3u8' }), '1')).toEqual([]);
  });

  it('fails closed on malformed / empty input', () => {
    expect(okruMediaFromOptions('not json', '1')).toEqual([]);
    expect(okruMediaFromOptions('{}', '1')).toEqual([]);
    expect(okruMediaFromOptions(JSON.stringify({ flashvars: { metadata: 'not json' } }), '1')).toEqual([]);
  });
});

describe('okruPageMedia (DOM scan)', () => {
  const optionsAttr = () =>
    JSON.stringify({
      flashvars: {
        metadata: JSON.stringify({
          videos: [
            { name: 'sd', url: 'https://vd1.okcdn.ru/?id=sd' },
            { name: 'full', url: 'https://vd1.okcdn.ru/?id=full' },
          ],
        }),
      },
    });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads the player [data-options] on an ok.ru video page', () => {
    const div = document.createElement('div');
    div.setAttribute('data-options', optionsAttr());
    document.body.appendChild(div);
    expect(okruPageMedia('https://ok.ru/video/219222312291')).toEqual([
      { url: 'https://vd1.okcdn.ru/?id=full', kind: 'video', ext: 'mp4', mediaKey: 'okru 219222312291' },
    ]);
  });

  it('no-ops off an ok.ru video page', () => {
    const div = document.createElement('div');
    div.setAttribute('data-options', optionsAttr());
    document.body.appendChild(div);
    expect(okruPageMedia('https://example.com/video/1')).toEqual([]);
  });
});
