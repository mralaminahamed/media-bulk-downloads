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
});
