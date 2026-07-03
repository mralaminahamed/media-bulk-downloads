import { passesSettingsFilters, filterImagesBySettings } from '@/extension/shared/filters';
import { ImageInfo, SettingsData } from '@/types';

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
};

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'x.jpg', alt: '', width: 100, height: 100, type: 'jpeg', fileSize: 0, isBase64: false, ...over,
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
