import { passesSettingsFilters, filterImagesBySettings, applyToolbarFilters } from '@/extension/shared/collection/filters';
import { ImageInfo, SettingsData, FilterOptions } from '@/types';

const base: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 400,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
  saveAs: false,
  notifyOnComplete: false,
  convertImagesTo: 'off',
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
  excludeEmoji: false,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
};

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'x.jpg', alt: '', width: 100, height: 100, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
});

describe('passesSettingsFilters', () => {
  it('keeps everything with default settings', () => {
    expect(passesSettingsFilters(img({}), base)).toBe(true);
  });

  it('applies the minimum size floor when dimensions are known', () => {
    const settings = { ...base, minimumImageSize: 75 };
    expect(passesSettingsFilters(img({ width: 100, height: 100 }), settings)).toBe(true);
    expect(passesSettingsFilters(img({ width: 50, height: 50 }), settings)).toBe(false);
  });

  it('never drops images with unknown dimensions (srcset / background)', () => {
    const settings = { ...base, minimumImageSize: 500 };
    expect(passesSettingsFilters(img({ width: 0, height: 0 }), settings)).toBe(true);
  });

  it('keeps a half-known item — enforces the floor only on the known dimension', () => {
    const settings = { ...base, minimumImageSize: 200 };
    // width known and above the floor, height unknown (0): kept.
    expect(passesSettingsFilters(img({ width: 500, height: 0 }), settings)).toBe(true);
    expect(passesSettingsFilters(img({ width: 0, height: 500 }), settings)).toBe(true);
    // width known and below the floor: still dropped (that dimension is real).
    expect(passesSettingsFilters(img({ width: 50, height: 0 }), settings)).toBe(false);
  });

  it('excludes base64 images when the setting is on', () => {
    const settings = { ...base, excludeBase64Images: true };
    expect(passesSettingsFilters(img({ isBase64: true }), settings)).toBe(false);
    expect(passesSettingsFilters(img({ isBase64: false }), settings)).toBe(true);
  });

  it('hides HLS streams unless capture is enabled', () => {
    const stream = img({ src: 'https://cdn.com/live.m3u8', kind: 'video', hlsManifest: 'https://cdn.com/live.m3u8' });
    // Default (off): stream is dropped, plain media is kept.
    expect(passesSettingsFilters(stream, base)).toBe(false);
    expect(passesSettingsFilters(img({}), base)).toBe(true);
    // Enabled: the stream passes.
    expect(passesSettingsFilters(stream, { ...base, captureHlsStreams: true })).toBe(true);
  });

  it('excludes emoji images when the setting is on', () => {
    const settings = { ...base, excludeEmoji: true };
    expect(passesSettingsFilters(img({ src: 'https://abs.twimg.com/emoji/v2/svg/1f9f8.svg' }), settings)).toBe(false);
    expect(passesSettingsFilters(img({ src: 'https://pbs.twimg.com/media/x.jpg' }), settings)).toBe(true);
  });
  it('keeps emoji images when the setting is off', () => {
    expect(passesSettingsFilters(img({ src: 'https://abs.twimg.com/emoji/v2/svg/1f9f8.svg' }), base)).toBe(true);
  });
});

describe('filterImagesBySettings', () => {
  it('filters a list by both size and base64 rules', () => {
    const images = [
      img({ src: 'big.jpg', width: 200, height: 200, isBase64: false }),
      img({ src: 'small.jpg', width: 10, height: 10, isBase64: false }),
      img({ src: 'data', width: 0, height: 0, isBase64: true }),
    ];
    const result = filterImagesBySettings(images, { ...base, minimumImageSize: 50, excludeBase64Images: true });
    expect(result.map((i) => i.src)).toEqual(['big.jpg']);
  });
});

const toolbarBase: Omit<ImageInfo, 'kind' | 'type' | 'src'> = {
  alt: '', width: 0, height: 0, fileSize: 0, isBase64: false,
};
const item = (over: Partial<ImageInfo>): ImageInfo =>
  ({ ...toolbarBase, src: 'x', type: 'png', kind: 'image', ...over }) as ImageInfo;

const F = (over: Partial<FilterOptions>): FilterOptions =>
  ({ mediaKind: 'all', imageType: 'all', minSize: 0, includeBase64: true, sizeBucket: 'all', search: '', sortBy: 'default', sortDir: 'desc', ...over });

describe('applyToolbarFilters — mediaKind', () => {
  const items = [
    item({ src: 'a', kind: 'image', type: 'png' }),
    item({ src: 'b', kind: 'video', type: 'mp4' }),
    item({ src: 'c', kind: 'audio', type: 'mp3' }),
  ];
  it('keeps all kinds when mediaKind is all', () => {
    expect(applyToolbarFilters(items, F({})).length).toBe(3);
  });
  it('filters to a single kind', () => {
    expect(applyToolbarFilters(items, F({ mediaKind: 'video' })).map((i) => i.src)).toEqual(['b']);
  });
  it('never hides av by size bucket (unknown dims)', () => {
    expect(applyToolbarFilters(items, F({ sizeBucket: 'large' })).some((i) => i.kind === 'video')).toBe(true);
  });
});

describe('applyToolbarFilters — format narrowing within a kind', () => {
  it('narrows video items by format', () => {
    const videoItems = [
      item({ src: 'v1', kind: 'video', type: 'mp4' }),
      item({ src: 'v2', kind: 'video', type: 'webm' }),
    ];
    expect(
      applyToolbarFilters(videoItems, F({ mediaKind: 'video', imageType: 'mp4' })).map((i) => i.src),
    ).toEqual(['v1']);
  });
});

describe('applyToolbarFilters — search', () => {
  const items = [
    item({ src: 'https://cdn/sunset-beach.jpg', alt: 'A calm evening', type: 'jpeg' }),
    item({ src: 'https://cdn/logo.png', alt: 'Brand logo', type: 'png' }),
    item({ src: 'https://cdn/clip.mp4', alt: '', type: 'mp4', kind: 'video' }),
  ];
  it('matches on filename', () => {
    expect(applyToolbarFilters(items, F({ search: 'sunset' })).map((i) => i.src)).toEqual(['https://cdn/sunset-beach.jpg']);
  });
  it('matches on alt text, case-insensitively', () => {
    expect(applyToolbarFilters(items, F({ search: 'BRAND' })).map((i) => i.src)).toEqual(['https://cdn/logo.png']);
  });
  it('matches on type', () => {
    expect(applyToolbarFilters(items, F({ search: 'mp4' })).map((i) => i.src)).toEqual(['https://cdn/clip.mp4']);
  });
  it('matches on the URL', () => {
    expect(applyToolbarFilters(items, F({ search: 'cdn/logo' })).map((i) => i.src)).toEqual(['https://cdn/logo.png']);
  });
  it('an empty/whitespace query keeps everything', () => {
    expect(applyToolbarFilters(items, F({ search: '   ' }))).toHaveLength(3);
  });
});

describe('applyToolbarFilters — sort', () => {
  const items = [
    item({ src: 'https://cdn/b.jpg', fileSize: 200, width: 10, height: 10, type: 'png' }),
    item({ src: 'https://cdn/a.jpg', fileSize: 100, width: 40, height: 40, type: 'jpeg' }),
    item({ src: 'https://cdn/c.jpg', fileSize: 0, width: 0, height: 0, type: 'gif' }),
  ];
  it('leaves collection order when sortBy is default', () => {
    expect(applyToolbarFilters(items, F({})).map((i) => i.src)).toEqual(['https://cdn/b.jpg', 'https://cdn/a.jpg', 'https://cdn/c.jpg']);
  });
  it('sorts by name ascending', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'name', sortDir: 'asc' })).map((i) => i.src)).toEqual([
      'https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg',
    ]);
  });
  it('sorts by size descending, unknown size last', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'size', sortDir: 'desc' })).map((i) => i.fileSize)).toEqual([200, 100, 0]);
  });
  it('sorts by size ascending with unknown still last', () => {
    // 0 = unknown always sinks to the end regardless of direction.
    expect(applyToolbarFilters(items, F({ sortBy: 'size', sortDir: 'asc' })).map((i) => i.fileSize)).toEqual([100, 200, 0]);
  });
  it('sorts by dimensions (pixel area) descending', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'dimensions', sortDir: 'desc' })).map((i) => i.src)).toEqual([
      'https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg',
    ]);
  });
  it('does not reorder the input array in place', () => {
    const input = [...items];
    applyToolbarFilters(input, F({ sortBy: 'name', sortDir: 'asc' }));
    expect(input.map((i) => i.src)).toEqual(['https://cdn/b.jpg', 'https://cdn/a.jpg', 'https://cdn/c.jpg']);
  });
});
