import { describe, it, expect } from 'vitest';
import { dedupeByCanonical } from '@mbd/core/collection/multiTab';
import type { ImageInfo } from '@mbd/core/types';

const img = (src: string, extra: Partial<ImageInfo> = {}): ImageInfo => ({
  src,
  alt: '',
  width: 0,
  height: 0,
  type: 'jpeg',
  fileSize: 0,
  isBase64: false,
  kind: 'image',
  ...extra,
});

describe('dedupeByCanonical', () => {
  it('keeps distinct images in first-seen order', () => {
    const out = dedupeByCanonical([img('https://a/1.jpg'), img('https://b/2.jpg')]);
    expect(out.map((i) => i.src)).toEqual(['https://a/1.jpg', 'https://b/2.jpg']);
  });

  it('collapses the same canonical identity across tabs, keeping the largest area', () => {
    const out = dedupeByCanonical([
      img('https://cdn.example/p/x.jpg?token=AAA', { width: 320, height: 240, sourcePage: { url: 'https://tab-a' } }),
      img('https://cdn.example/p/x.jpg?token=BBB', { width: 2048, height: 1536, sourcePage: { url: 'https://tab-b' } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].width).toBe(2048);
    expect(out[0].sourcePage?.url).toBe('https://tab-b');
  });

  it('breaks an area tie by byte size', () => {
    const out = dedupeByCanonical([
      img('https://cdn.example/p/y.jpg?token=AAA', { width: 100, height: 100, fileSize: 4_000 }),
      img('https://cdn.example/p/y.jpg?token=BBB', { width: 100, height: 100, fileSize: 9_000 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].fileSize).toBe(9_000);
  });

  it('keeps the first occurrence on a full tie and holds its slot', () => {
    const out = dedupeByCanonical([
      img('https://cdn.example/p/z.jpg?token=AAA', { width: 100, height: 100, sourcePage: { url: 'https://first' } }),
      img('https://cdn.example/p/z.jpg?token=BBB', { width: 100, height: 100, sourcePage: { url: 'https://second' } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sourcePage?.url).toBe('https://first');
  });

  it('a later tab upgrading an earlier identity keeps the earlier slot position', () => {
    const out = dedupeByCanonical([
      img('https://cdn.example/p/x.jpg?token=A', { width: 320, height: 240 }), // slot 0
      img('https://b/2.jpg'), // slot 1
      img('https://cdn.example/p/x.jpg?token=B', { width: 2048, height: 1536 }), // upgrades slot 0
    ]);
    expect(out.map((i) => i.src)).toEqual(['https://cdn.example/p/x.jpg?token=B', 'https://b/2.jpg']);
  });

  it('is a no-op on an empty list', () => {
    expect(dedupeByCanonical([])).toEqual([]);
  });
});
