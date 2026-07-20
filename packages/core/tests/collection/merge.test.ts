import { describe, it, expect } from 'vitest';
import { mergeScannedMedia } from '@mbd/core/collection/merge';
import type { ImageInfo } from '@mbd/core/types';

const img = (src: string, extra: Partial<ImageInfo> = {}): ImageInfo => ({
  src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...extra,
});

describe('mergeScannedMedia', () => {
  it('appends genuinely new items after the existing ones, in order', () => {
    const out = mergeScannedMedia([img('https://a/1.jpg')], [img('https://a/2.jpg')]);
    expect(out.map((m) => m.src)).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
  });

  it('keeps the FIRST occurrence on a plain canonical-src collision (volatile query, no mediaKey)', () => {
    const out = mergeScannedMedia(
      [img('https://img.example.net/p/x.jpg?token=AAA')],
      [img('https://img.example.net/p/x.jpg?token=BBB')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].src).toBe('https://img.example.net/p/x.jpg?token=AAA');
  });

  it('upgrade-REPLACES an existing item when a found item repeats its mediaKey, keeping the slot', () => {
    const existing = [img('https://x.fbcdn.net/grid_n.jpg', { mediaKey: 'fb:301', width: 417, height: 417 }), img('https://a/keep.jpg')];
    const found = [img('https://x.fbcdn.net/orig_n.jpg', { mediaKey: 'fb:301', width: 2048, height: 1365 })];
    const out = mergeScannedMedia(existing, found);
    expect(out).toHaveLength(2);
    expect(out[0].src).toBe('https://x.fbcdn.net/orig_n.jpg');
    expect(out[1].src).toBe('https://a/keep.jpg');
  });

  it('treats different mediaKeys as different items (no cross-fbid collision)', () => {
    const out = mergeScannedMedia(
      [img('https://x.fbcdn.net/a.jpg', { mediaKey: 'fb:1' })],
      [img('https://x.fbcdn.net/b.jpg', { mediaKey: 'fb:2' })],
    );
    expect(out).toHaveLength(2);
  });

  it('keeps both items when mediaKey is an empty string (bug #5: "" must not act like a present, shared key)', () => {
    const out = mergeScannedMedia(
      [img('https://a.com/1.jpg', { mediaKey: '' })],
      [img('https://b.com/2.jpg', { mediaKey: '' })],
    );
    expect(out).toHaveLength(2);
  });
});
