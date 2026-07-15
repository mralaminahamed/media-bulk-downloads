import {
  downloadExtension,
  originalNameFromUrl,
  extensionForType,
  buildDownloadFilename,
} from '@mbd/core/collection/download-name';
import { ImageInfo, SettingsData } from '@mbd/core/types';

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

describe('extensionForType', () => {
  it('maps jpeg to the conventional .jpg (matching URL-captured .jpg)', () => {
    expect(extensionForType('jpeg')).toBe('jpg');
  });
  it('passes through the other known raster/vector formats verbatim', () => {
    for (const t of ['png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']) {
      expect(extensionForType(t)).toBe(t);
    }
  });
  it('falls back to jpg for any unrecognized type', () => {
    // The default branch: an unknown or non-image type should still yield a safe,
    // openable extension rather than an empty or bogus one.
    expect(extensionForType('unknown')).toBe('jpg');
    expect(extensionForType('jfif')).toBe('jpg'); // canonicalizes to jpeg elsewhere, not in this table
    expect(extensionForType('')).toBe('jpg');
  });
});

describe('buildDownloadFilename', () => {
  const settings: SettingsData = {
    downloadPath: '',
    fileNamePrefix: 'image_',
    popupWidth: 400,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
    excludeEmoji: false,
    saveAs: false,
    notifyOnComplete: false,
    convertImagesTo: 'off',
    convertMetadata: 'preserve',
    namingMode: 'prefixed',
    thumbnailSize: 120,
    previewSize: 360,
    bubbleEnabled: false,
    bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
    bubbleWidth: 440,
    bubbleHeight: 560,
    bubblePanelPlacement: 'anchored',
    bubblePanelPoint: { x: 40, y: 40 },
    resolveOriginals: false,
    captureHlsStreams: false,
    streamQuality: 'auto',
    audioFormat: 'm4a',
    metadataSidecar: false,
    nearDuplicateThreshold: 8,
    downloadConcurrency: 5,
    deepScanMaxItems: 1000,
    deepScanMaxSeconds: 20,
    deepScanMaxScrolls: 40,
    deepScanClickLoadMore: false,
    smartPageDefaults: false,
    rememberScanBehaviour: true,
    skipDuplicateDownloads: true,
  };
  const image = (over: Partial<ImageInfo>): ImageInfo => ({
    src: 'https://cdn.com/path/photo.jpg', alt: '', width: 0, height: 0,
    type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
  });

  it('prefixed mode: builds <prefix><index+1>.<ext>, index is 1-based', () => {
    // index 0 -> _1; the extension comes from the type (jpeg -> jpg).
    expect(buildDownloadFilename(image({}), 0, settings)).toBe('image_1.jpg');
    expect(buildDownloadFilename(image({}), 4, settings)).toBe('image_5.jpg');
  });

  it('prefixed mode: falls back to image_ when the configured prefix sanitizes to empty', () => {
    // A prefix made only of illegal path chars sanitizes to '' -> the `|| 'image_'`
    // fallback keeps the name well-formed.
    expect(buildDownloadFilename(image({}), 0, { ...settings, fileNamePrefix: '<<<' })).toBe('image_1.jpg');
    // A custom prefix is honored otherwise.
    expect(buildDownloadFilename(image({}), 0, { ...settings, fileNamePrefix: 'shot-' })).toBe('shot-1.jpg');
  });

  it('original mode: uses the URL basename + detected extension', () => {
    expect(buildDownloadFilename(image({ src: 'https://cdn.com/a/sunset.png', type: 'png' }), 2, { ...settings, namingMode: 'original' }))
      .toBe('sunset.png');
  });

  it('original mode: falls back to the prefixed name when the URL yields no basename', () => {
    // A data: URI has no derivable name (originalNameFromUrl -> null), so the
    // prefixed sequential name is used instead.
    expect(buildDownloadFilename(image({ src: 'data:image/png;base64,AAAA' }), 0, { ...settings, namingMode: 'original' }))
      .toBe('image_1.jpg');
  });

  it('prepends the expanded download-path template as a folder', () => {
    // {domain} and {kind} resolve against sourcePageUrl; date is omitted to keep
    // the assertion deterministic.
    const result = buildDownloadFilename(
      image({ kind: 'image' }),
      0,
      { ...settings, downloadPath: 'Media/{domain}/{kind}' },
      'https://www.example.com/gallery/page',
    );
    expect(result).toBe('Media/example.com/image/image_1.jpg');
  });

  it("prefers the item's own sourcePage over the batch URL for {domain} (#283 multi-tab)", () => {
    // A multi-tab item carries its origin tab; that must win over the batch-level
    // active-tab URL so each item lands in its own site folder.
    const result = buildDownloadFilename(
      image({ kind: 'image', sourcePage: { url: 'https://shop.example.org/p/1' } }),
      0,
      { ...settings, downloadPath: 'Media/{domain}' },
      'https://www.active-tab.com/page',
    );
    expect(result).toBe('Media/example.org/image_1.jpg');
  });

  it('collapses an empty {host} token segment but still returns dir/fileName', () => {
    // No sourcePageUrl -> host '' -> the {host} segment collapses away, leaving a
    // shorter (but non-empty) directory.
    const result = buildDownloadFilename(
      image({}),
      0,
      { ...settings, downloadPath: '{host}/pics' },
    );
    expect(result).toBe('pics/image_1.jpg');
  });

  it('returns just the filename when the template expands to an empty path', () => {
    // downloadPath resolves to '' (all tokens empty) -> the `dir ? ... : fileName`
    // false branch returns the bare filename with no leading slash.
    const result = buildDownloadFilename(
      image({}),
      0,
      { ...settings, downloadPath: '{host}' }, // no sourcePageUrl -> host '' -> dir ''
    );
    expect(result).toBe('image_1.jpg');
  });

  it('strips an embedded slash from a custom fileNamePrefix so it cannot create a subfolder (bug #4 path-injection)', () => {
    const result = buildDownloadFilename(image({}), 0, { ...settings, fileNamePrefix: 'sub/dir_' });
    expect(result).not.toContain('/');
    expect(result).toBe('subdir_1.jpg');
  });

  it('uses the item ext override in the built name (a/v capture)', () => {
    // A captured HLS video muxed to mp4: ext override flows through downloadExtension.
    const result = buildDownloadFilename(
      image({ kind: 'video', type: 'm3u8', src: 'https://x/master.m3u8', ext: 'mp4' }),
      0,
      settings,
    );
    expect(result).toBe('image_1.mp4');
  });
});
