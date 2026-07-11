import { deepScanCapMessage, downloadable, pendingVideos } from '@/extension/popup/lib/appHelpers';
import { ImageInfo } from '@/types';

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'x.jpg', alt: '', width: 100, height: 100, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
});

describe('downloadable', () => {
  it('excludes pending/stream items and keeps plain ones', () => {
    const plain = img({ src: 'plain.jpg' });
    const unresolvedImage = img({ src: 'unresolved-image.jpg', unresolvedImage: true });
    const unresolvedVideo = img({ src: 'unresolved-video.mp4', kind: 'video', unresolvedVideo: true });
    const hlsManifest = img({ src: 'stream.m3u8', kind: 'video', hlsManifest: 'stream.m3u8' });

    const result = downloadable([plain, unresolvedImage, unresolvedVideo, hlsManifest]);

    expect(result).toEqual([plain]);
  });
});

describe('pendingVideos', () => {
  it('returns only pending videos that carry a resolve hint', () => {
    const withHint = img({ src: 'a.mp4', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' } });
    const withoutHint = img({ src: 'b.mp4', kind: 'video', unresolvedVideo: true });
    const resolvedVideo = img({ src: 'c.mp4', kind: 'video', resolveHint: { platform: 'twitter', id: '2' } });
    const notVideo = img({ src: 'd.jpg', unresolvedImage: true });

    expect(pendingVideos([withHint, withoutHint, resolvedVideo, notVideo])).toEqual([withHint]);
  });
});

describe('deepScanCapMessage', () => {
  it('returns a note for each cap reason', () => {
    expect(deepScanCapMessage('max-items', 250)).toBe('Stopped at the 250-item limit — some media may remain.');
    expect(deepScanCapMessage('max-time', 250)).toBe('Stopped at the time limit — some media may remain.');
    expect(deepScanCapMessage('max-scrolls', 250)).toBe('Stopped at the scroll limit — some media may remain.');
  });

  it('returns null for completion, abort, error, and undefined reasons', () => {
    expect(deepScanCapMessage('complete', 250)).toBeNull();
    expect(deepScanCapMessage('aborted', 250)).toBeNull();
    expect(deepScanCapMessage('error', 250)).toBeNull();
    expect(deepScanCapMessage(undefined, 250)).toBeNull();
  });
});
