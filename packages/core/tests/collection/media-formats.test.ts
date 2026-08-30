import {
  normalizeImageFormat, imageExtForType, preferredImageExt, isImageExt, isAvExt, isStreamExt,
  IMAGE_FORMAT_LABELS,
} from '@mbd/core/collection/media-formats';
import { detectType, looksLikeMediaUrl } from '@mbd/core/collection/imageUrl';
import { downloadExtension } from '@mbd/core/collection/download-name';
import { FORMAT_LABELS } from '@mbd/core/collection/filters';
import type { ImageInfo } from '@mbd/core/types';

describe('normalizeImageFormat', () => {
  it('folds the jpeg spellings to one canonical type', () => {
    for (const e of ['jpg', 'JPEG', 'jfif', 'jpe', 'pjpeg']) expect(normalizeImageFormat(e)).toBe('jpeg');
  });

  it('recognises the modern formats that used to fall through to unknown', () => {
    expect(normalizeImageFormat('heic')).toBe('heic');
    expect(normalizeImageFormat('heif')).toBe('heif');
    expect(normalizeImageFormat('jxl')).toBe('jxl');
    expect(normalizeImageFormat('tif')).toBe('tiff');
    expect(normalizeImageFormat('tiff')).toBe('tiff');
    expect(normalizeImageFormat('jp2')).toBe('jp2');
    expect(normalizeImageFormat('apng')).toBe('apng');
  });

  it('keeps the already-supported set working', () => {
    for (const e of ['png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']) {
      expect(normalizeImageFormat(e)).toBe(e);
    }
  });

  it('folds the MIME subtype spellings', () => {
    expect(normalizeImageFormat('svg+xml')).toBe('svg');
    expect(normalizeImageFormat('svgz')).toBe('svg');
    expect(normalizeImageFormat('x-icon')).toBe('ico');
  });

  it('returns unknown for anything else', () => {
    for (const e of ['php', 'html', 'exe', '', 'mp4']) expect(normalizeImageFormat(e)).toBe('unknown');
  });
});

describe('imageExtForType', () => {
  it('maps a canonical type to the extension the file should carry', () => {
    expect(imageExtForType('jpeg')).toBe('jpg');
    expect(imageExtForType('tiff')).toBe('tiff');
    expect(imageExtForType('heic')).toBe('heic');
    expect(imageExtForType('jxl')).toBe('jxl');
    expect(imageExtForType('png')).toBe('png');
  });

  it('returns null for a type it does not own, so callers pick their own fallback', () => {
    expect(imageExtForType('unknown')).toBeNull();
    expect(imageExtForType('mp4')).toBeNull();
  });
});

describe('extension predicates', () => {
  it('isImageExt covers every format the table knows, in any spelling', () => {
    for (const e of ['jpg', 'jpeg', 'jfif', 'png', 'apng', 'gif', 'webp', 'avif', 'heic', 'heif', 'jxl', 'tif', 'tiff', 'jp2', 'bmp', 'ico', 'svg', 'svgz']) {
      expect(isImageExt(e)).toBe(true);
    }
    expect(isImageExt('mp4')).toBe(false);
    expect(isImageExt('php')).toBe(false);
  });

  it('isAvExt and isStreamExt are disjoint from images', () => {
    expect(isAvExt('mp4')).toBe(true);
    expect(isAvExt('flac')).toBe(true);
    expect(isAvExt('jpg')).toBe(false);
    expect(isStreamExt('m3u8')).toBe(true);
    expect(isStreamExt('mpd')).toBe(true);
    expect(isStreamExt('mp4')).toBe(false);
  });
});

describe('IMAGE_FORMAT_LABELS', () => {
  it('has a label for every canonical type the table can produce', () => {
    const types = new Set(
      ['jpg', 'png', 'apng', 'gif', 'webp', 'avif', 'heic', 'heif', 'jxl', 'tiff', 'jp2', 'bmp', 'ico', 'svg']
        .map(normalizeImageFormat),
    );
    for (const t of types) expect(IMAGE_FORMAT_LABELS[t]).toBeTruthy();
  });
});

describe('end-to-end: a modern format keeps its identity all the way to disk', () => {
  it('no longer saves HEIC/HEIF/JXL/TIFF/JP2/APNG bytes under a .jpg name', () => {
    const chain = ['heic', 'heif', 'jxl', 'tiff', 'jp2', 'apng', 'avif', 'png'].map((e) => {
      const url = `https://ex.com/a.${e}`;
      const img: ImageInfo = {
        src: url, alt: '', width: 0, height: 0, type: detectType(url),
        fileSize: 0, isBase64: false, kind: 'image',
      };
      return `${e}->${downloadExtension(img)}`;
    });
    expect(chain).toEqual([
      'heic->heic', 'heif->heif', 'jxl->jxl', 'tiff->tiff',
      'jp2->jp2', 'apng->apng', 'avif->avif', 'png->png',
    ]);
  });

  it('gives those types a real filter label instead of an unreachable one', () => {
    expect(detectType('https://ex.com/a.heic')).toBe('heic');
    expect(FORMAT_LABELS.heic).toBe('HEIC');
    expect(FORMAT_LABELS.jxl).toBe('JPEG XL');
  });

  it('still recognises them as media URLs for the gallery-link rule', () => {
    expect(looksLikeMediaUrl('https://ex.com/photo.heic')).toBe(true);
    expect(looksLikeMediaUrl('https://ex.com/photo.jxl?v=2')).toBe(true);
  });

  it('keeps .svgz saveable under its own name', () => {
    expect(preferredImageExt('svgz')).toBe('svgz');
    expect(normalizeImageFormat('svgz')).toBe('svg');
  });
});
