import { passesSettingsFilters, filterImagesBySettings, applyToolbarFilters } from '@/extension/shared/filters';
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
  ({ mediaKind: 'all', imageType: 'all', minSize: 0, includeBase64: true, sizeBucket: 'all', ...over });

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
