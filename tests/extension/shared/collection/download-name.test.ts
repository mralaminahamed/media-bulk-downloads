import { downloadExtension } from '@/extension/shared/collection/download-name';
import { ImageInfo } from '@/types';

describe('downloadExtension', () => {
  it('honors an explicit ext override on a video item even though the type maps to a different extension', () => {
    // A captured HLS stream: the manifest is `.m3u8`, but the offscreen engine
    // muxed it down to an mp4 blob — `ext` must win so the download isn't
    // saved with the manifest's extension.
    const item: ImageInfo = {
      kind: 'video', type: 'm3u8', src: 'https://x/master.m3u8', ext: 'mp4',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('mp4');
  });

  it('falls back to the type-derived av extension when a video item carries no ext', () => {
    const item: ImageInfo = {
      kind: 'video', type: 'mp4', src: 'https://x/v.mp4',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('mp4');
  });

  it('still prefers ext for image items (pre-existing behavior)', () => {
    const item: ImageInfo = {
      kind: 'image', type: 'jpeg', src: 'https://x/a.jpg', ext: 'jpg',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('jpg');
  });

  it('falls back to the type-derived extension for an image item with no ext', () => {
    const item: ImageInfo = {
      kind: 'image', type: 'png', src: 'https://x/a.png',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('png');
  });
});
