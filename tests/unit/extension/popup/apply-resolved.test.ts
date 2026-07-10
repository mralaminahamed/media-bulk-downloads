import { applyResolved } from '@/extension/popup/apply-resolved';
import { ImageInfo } from '@/types';

const base = {
  src: 'poster.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0,
  isBase64: false, kind: 'video', unresolvedVideo: true,
  resolveHint: { platform: 'vimeo', id: '1' },
} as unknown as ImageInfo;

describe('applyResolved', () => {
  it('swaps a direct URL in place and clears the pending flags', () => {
    const out = applyResolved(base, { url: 'https://x/hi.mp4' }, false);
    expect(out).toMatchObject({ src: 'https://x/hi.mp4', unresolvedVideo: false, resolveHint: undefined });
    expect(out?.hlsManifest).toBeUndefined();
  });

  it('turns an HLS result into a capturable stream when capture is on', () => {
    const out = applyResolved(base, { url: 'https://x/master.m3u8', hls: true }, true);
    expect(out).toMatchObject({
      src: 'https://x/master.m3u8',
      hlsManifest: 'https://x/master.m3u8',
      type: 'm3u8',
      unresolvedVideo: false,
      resolveHint: undefined,
    });
  });

  it('leaves an HLS-only item pending (returns null) when capture is off', () => {
    expect(applyResolved(base, { url: 'https://x/master.m3u8', hls: true }, false)).toBeNull();
  });

  it('clears unresolvedImage and swaps src on a resolved pending image', () => {
    const item = {
      src: 'https://x.com/u/status/1/photo/1', kind: 'image', unresolvedImage: true,
      resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    } as any;
    const out = applyResolved(item, { url: 'https://pbs.twimg.com/media/AA?format=jpg&name=orig' }, false);
    expect(out).toMatchObject({ src: 'https://pbs.twimg.com/media/AA?format=jpg&name=orig', unresolvedImage: false, resolveHint: undefined });
  });
});
