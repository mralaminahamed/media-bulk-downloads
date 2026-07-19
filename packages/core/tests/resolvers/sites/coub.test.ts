import { coubMediaFromJson } from '@mbd/core/resolvers/sites/coub';

const MP4 = 'https://attachments-cdn-s.coub.com/coub_storage/coub/simple/cw_video_for_sharing/99b/510c/1784350318_looped.mp4';
const PIC = 'https://attachments-cdn-s.coub.com/coub_storage/coub/simple/cw_image/f8f/6b7/med_1784350307.jpg';
const coub = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({ permalink: '4b5jpx', file_versions: { share: { default: MP4 } }, picture: PIC, ...over });

describe('coubMediaFromJson', () => {
  it('returns the combined-muxed share.default mp4 with poster + permalink key', () => {
    expect(coubMediaFromJson(coub())).toEqual([
      { url: MP4, kind: 'video', ext: 'mp4', mediaKey: 'coub 4b5jpx', poster: PIC },
    ]);
  });

  it('returns [] when there is no share.default render', () => {
    expect(coubMediaFromJson(JSON.stringify({ permalink: 'x', file_versions: { html5: {} } }))).toEqual([]);
  });

  it('returns [] on malformed, empty, or nullish input', () => {
    expect(coubMediaFromJson('not json{')).toEqual([]);
    expect(coubMediaFromJson('')).toEqual([]);
    expect(coubMediaFromJson(null)).toEqual([]);
    expect(coubMediaFromJson(undefined)).toEqual([]);
  });

  it('rejects a share URL on a non-coub host (untrusted page JSON)', () => {
    expect(coubMediaFromJson(coub({ file_versions: { share: { default: 'https://evil.example.com/x.mp4' } } }))).toEqual([]);
  });

  it('keeps the mp4 but drops an off-host poster', () => {
    const r = coubMediaFromJson(coub({ picture: 'https://evil.example.com/p.jpg' }));
    expect(r[0].url).toBe(MP4);
    expect(r[0].poster).toBeUndefined();
  });

  it('omits mediaKey when the permalink is not a bare slug', () => {
    expect(coubMediaFromJson(coub({ permalink: 'bad/slug' }))[0].mediaKey).toBeUndefined();
  });
});
