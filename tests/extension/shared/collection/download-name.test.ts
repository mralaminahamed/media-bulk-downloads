import { downloadExtension, originalNameFromUrl } from '@/extension/shared/collection/download-name';
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

  it('derives a jpeg-typed image (no ext) as .jpg, matching URL-captured .jpg', () => {
    const item: ImageInfo = {
      kind: 'image', type: 'jpeg', src: 'https://x/photo?format=jpeg',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('jpg');
  });

  it('derives an av extension from the URL when the type is unrecognized', () => {
    // No ext, kind is video/audio, but the type maps to nothing (avExtensionForType
    // returns null), so the extension is read from the URL instead.
    const item: ImageInfo = {
      kind: 'video', type: 'unknown', src: 'https://x/clip.webm',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('webm');
  });

  it('falls back to mp4 for a video with no ext, unknown type, and extension-less src', () => {
    const item: ImageInfo = {
      kind: 'video', type: 'unknown', src: 'https://x/stream',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('mp4');
  });

  it('falls back to mp3 for an audio item with no ext, unknown type, and extension-less src', () => {
    const item: ImageInfo = {
      kind: 'audio', type: 'unknown', src: 'https://x/stream',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    };
    expect(downloadExtension(item)).toBe('mp3');
  });
});

describe('originalNameFromUrl', () => {
  it('derives a safe basename from a normal URL, dropping the extension', () => {
    expect(originalNameFromUrl('https://cdn.com/path/photo.jpg')).toBe('photo');
    // Only the final dot is treated as the extension boundary.
    expect(originalNameFromUrl('https://cdn.com/a/b/report.final.pdf')).toBe('report.final');
  });

  it('decodes percent-encoded names', () => {
    expect(originalNameFromUrl('https://cdn.com/my%20holiday%20pic.jpg')).toBe('my holiday pic');
  });

  it('keeps the raw basename when the percent-escape is malformed', () => {
    // decodeURIComponent throws on `%ZZ`; the raw (still-encoded) name is used.
    expect(originalNameFromUrl('https://cdn.com/bad%ZZ.jpg')).toBe('bad%ZZ');
  });

  it('keeps a leading-dot dotfile intact (no extension to strip)', () => {
    // The dot is the first char, so it is not treated as an extension separator.
    expect(originalNameFromUrl('https://cdn.com/.htaccess')).toBe('.htaccess');
  });

  it('returns null for data/blob URIs', () => {
    expect(originalNameFromUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(originalNameFromUrl('blob:https://ex.com/uuid')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(originalNameFromUrl('not a url')).toBeNull();
  });

  it('returns null when the path has no basename (trailing slash / root)', () => {
    expect(originalNameFromUrl('https://cdn.com/folder/')).toBeNull();
    expect(originalNameFromUrl('https://cdn.com/')).toBeNull();
  });

  it('returns null when sanitizing leaves nothing usable', () => {
    // A basename made entirely of illegal filename characters sanitizes to ''.
    expect(originalNameFromUrl('https://cdn.com/%3C%3E%7C.jpg')).toBeNull();
  });
});
