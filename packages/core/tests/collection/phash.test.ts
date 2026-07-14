import { describe, it, expect } from 'vitest';
import {
  computePHash,
  hammingDistance,
  clusterNearDuplicates,
  pickKeeper,
  markNearDuplicates,
  type DedupInput,
} from '@mbd/core/collection/phash';

const SIZE = 32;
const TAU = 2 * Math.PI;
const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

// A photo-like continuous image: energy concentrated in the lowest spatial
// frequencies (as most real photos are), defined over a 64-unit period so it can
// be sampled at any source resolution.
const field = (fx: number, fy: number): number =>
  128 +
  70 * Math.cos((TAU / 64) * fx) +
  55 * Math.cos((TAU / 64) * 2 * fy) +
  40 * Math.cos((TAU / 64) * (fx + fy)) +
  25 * Math.cos((TAU / 64) * 3 * fx);

/**
 * Box-downscales `field` from a `source`×`source` sampling grid to 32×32 — exactly
 * what drawing a `source`px image onto a 32×32 canvas does. `dither` adds broadband
 * noise to mimic JPEG re-encoding. Downscaling a shared image at two resolutions
 * (registered, same framing) is the real "thumbnail vs original" case.
 */
function downscale(source: number, dither = 0): number[] {
  const f = source / SIZE;
  const out: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let s = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) s += field(((x * f + i) * 64) / source, ((y * f + j) * 64) / source);
      }
      let v = s / (f * f);
      if (dither) {
        let r = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        r -= Math.floor(r);
        v += (r - 0.5) * dither;
      }
      out.push(clamp(v));
    }
  }
  return out;
}

const original = downscale(256); // the same picture from a 256px source
const thumbnail = downscale(128, 4); // …and from a 128px source, JPEG-re-encoded
const stripes = Array.from({ length: SIZE * SIZE }, (_, i) => ((i % SIZE) % 4 < 2 ? 20 : 235));
const otherPhoto = Array.from({ length: SIZE * SIZE }, (_, i) => {
  const x = i % SIZE;
  const y = Math.floor(i / SIZE);
  return clamp(128 + 50 * Math.cos((TAU / 32) * 4 * y) + 40 * Math.cos((TAU / 32) * 2 * x) - 30 * Math.cos((TAU / 32) * 5 * (x - y)));
});

describe('computePHash', () => {
  it('produces a stable 16-char lowercase hex string', () => {
    const h = computePHash(original);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(computePHash(original)).toBe(h); // deterministic
  });

  it('rejects wrong-length input', () => {
    expect(() => computePHash([1, 2, 3])).toThrow(/1024/);
  });

  it('stays within the near-duplicate band across a resolution change + re-encode', () => {
    // Same picture, 256px vs 128px source + JPEG dither — the real thumbnail/original
    // case. Well within the default threshold (8) and nowhere near the distinct band.
    expect(hammingDistance(computePHash(original), computePHash(thumbnail))).toBeLessThanOrEqual(8);
  });

  it('discriminates structurally different images by a wide margin', () => {
    expect(hammingDistance(computePHash(original), computePHash(stripes))).toBeGreaterThan(20);
    expect(hammingDistance(computePHash(original), computePHash(otherPhoto))).toBeGreaterThan(20);
  });
});

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
  });

  it('is 64 for fully-inverted hashes', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000007')).toBe(3); // 0x7 = 0b0111
  });

  it('throws on length mismatch', () => {
    expect(() => hammingDistance('00', '0000')).toThrow(/length/);
  });
});

describe('clusterNearDuplicates', () => {
  const item = (id: string, pHash: string) => ({ id, pHash });

  it('groups items within the threshold and isolates the distant one', () => {
    const items = [
      item('a', '0000000000000000'),
      item('b', '0000000000000001'), // 1 from a
      item('c', '0000000000000003'), // 2 from a, 1 from b
      item('z', 'ffffffffffffffff'), // far from all
    ];
    const clusters = clusterNearDuplicates(items, 5).map((c) => c.map((i) => i.id));
    expect(clusters).toContainEqual(['a', 'b', 'c']);
    expect(clusters).toContainEqual(['z']);
    expect(clusters).toHaveLength(2);
  });

  it('respects the threshold boundary', () => {
    const items = [item('a', '0000000000000000'), item('b', '000000000000000f')]; // distance 4
    expect(clusterNearDuplicates(items, 3).map((c) => c.length)).toEqual([1, 1]);
    expect(clusterNearDuplicates(items, 4).map((c) => c.length)).toEqual([2]);
  });

  it('does NOT chain transitively across the threshold (complete linkage, #198)', () => {
    // a–b within 4, b–c within 4, but a–c is 8 (> threshold). Complete linkage keeps
    // c out of {a,b} — it must be within threshold of EVERY member — so the far ends
    // don't collapse into one group where c would be hidden as a "duplicate".
    const items = [
      item('a', '0000000000000000'),
      item('b', '000000000000000f'), // 4 from a
      item('c', '00000000000000ff'), // 4 from b, 8 from a
    ];
    const clusters = clusterNearDuplicates(items, 4).map((c) => c.map((i) => i.id));
    expect(clusters).toEqual([['a', 'b'], ['c']]);
  });

  it('preserves input order in groups and members', () => {
    const items = [item('a', '0000000000000000'), item('z', 'ffffffffffffffff'), item('b', '0000000000000001')];
    const clusters = clusterNearDuplicates(items, 2).map((c) => c.map((i) => i.id));
    expect(clusters).toEqual([['a', 'b'], ['z']]);
  });
});

describe('pickKeeper', () => {
  it('keeps the largest pixel area', () => {
    const cluster = [
      { id: 'small', width: 320, height: 240 },
      { id: 'big', width: 2048, height: 1536 },
    ];
    expect(pickKeeper(cluster).id).toBe('big');
  });

  it('breaks an area tie by byte size', () => {
    const cluster = [
      { id: 'light', width: 100, height: 100, fileSize: 5_000 },
      { id: 'heavy', width: 100, height: 100, fileSize: 9_000 },
    ];
    expect(pickKeeper(cluster).id).toBe('heavy');
  });

  it('keeps the first on a full tie', () => {
    const cluster = [
      { id: 'first', width: 100, height: 100, fileSize: 1_000 },
      { id: 'second', width: 100, height: 100, fileSize: 1_000 },
    ];
    expect(pickKeeper(cluster).id).toBe('first');
  });

  it('treats unknown dimensions as smallest', () => {
    const cluster = [
      { id: 'sized', width: 800, height: 600 },
      { id: 'dimensionless', width: 0, height: 0, fileSize: 999_999 },
    ];
    expect(pickKeeper(cluster).id).toBe('sized');
  });
});

describe('markNearDuplicates', () => {
  const inp = (mediaKey: string, pHash: string, width = 0, height = 0, fileSize = 0): DedupInput => ({
    mediaKey,
    pHash,
    width,
    height,
    fileSize,
  });

  it('marks non-keepers as duplicates and leaves the keeper visible', () => {
    const marks = markNearDuplicates(
      [
        inp('thumb', '0000000000000000', 320, 240),
        inp('orig', '0000000000000001', 2048, 1536),
      ],
      5,
    );
    expect(marks.get('orig')).toEqual({ nearDuplicate: false, duplicateGroupId: 'orig' });
    expect(marks.get('thumb')).toEqual({ nearDuplicate: true, duplicateGroupId: 'orig' });
  });

  it('emits no marks for a singleton (nothing to collapse)', () => {
    const marks = markNearDuplicates(
      [inp('a', '0000000000000000', 100, 100), inp('z', 'ffffffffffffffff', 100, 100)],
      5,
    );
    expect(marks.size).toBe(0);
  });

  it('does not hide a distinct frame that only chains through a near neighbour (#198)', () => {
    // a↔b and b↔c are each 6 apart (≤ threshold 8), but a↔c is 12 (> 8). Single
    // linkage would chain all three and hide c; complete linkage keeps c its own
    // group, so "download all" still saves it.
    const marks = markNearDuplicates(
      [
        inp('a', '0000000000000000', 100, 100),
        inp('b', '000000000000003f', 100, 100), // 6 from a
        inp('c', '0000000000000fff', 50, 50), //   6 from b, 12 from a
      ],
      8,
    );
    expect(marks.get('c')).toBeUndefined(); // the distant frame stays visible
    // a & b ARE genuine near-duplicates → exactly one of them is marked hidden.
    expect([marks.get('a')?.nearDuplicate, marks.get('b')?.nearDuplicate].filter((v) => v === true)).toHaveLength(1);
  });

  it('groups three resolutions of one image, keeping the largest', () => {
    const marks = markNearDuplicates(
      [
        inp('s', '0000000000000000', 320, 240),
        inp('m', '0000000000000001', 800, 600),
        inp('l', '0000000000000003', 2048, 1536),
      ],
      5,
    );
    expect(marks.get('l')?.nearDuplicate).toBe(false);
    expect(marks.get('s')?.nearDuplicate).toBe(true);
    expect(marks.get('m')?.nearDuplicate).toBe(true);
    expect(marks.get('s')?.duplicateGroupId).toBe('l');
    expect(marks.get('m')?.duplicateGroupId).toBe('l');
  });
});
