import { describe, it, expect } from 'vitest';
import { jsonByteSize, withinByteBudget } from '@mbd/storage/byte-budget';

describe('jsonByteSize — UTF-8 byte length of the JSON', () => {
  it('counts ASCII as one byte each', () => {
    expect(jsonByteSize('ab')).toBe(4); // "ab" with the surrounding quotes
  });

  it('counts multi-byte characters by their UTF-8 size, not UTF-16 code units', () => {
    // "世界" (2 CJK chars) = 3 bytes each in UTF-8; JSON.stringify adds 2 quote bytes.
    expect(jsonByteSize('世界')).toBe(2 + 3 + 3);
    // An emoji is one astral char (2 UTF-16 code units) but 4 UTF-8 bytes.
    expect(jsonByteSize('🚀')).toBe(2 + 4);
    // The old JS `.length` would have under-counted both — the bug this fixes.
    expect(JSON.stringify('世界').length).toBeLessThan(jsonByteSize('世界'));
    expect(JSON.stringify('🚀').length).toBeLessThan(jsonByteSize('🚀'));
  });
});

describe('withinByteBudget', () => {
  it('keeps leading entries until the cumulative UTF-8 budget is exceeded', () => {
    const entries = ['aaaa', 'bbbb', 'cccc']; // 6 bytes serialized each ("xxxx")
    expect(withinByteBudget(entries, 13)).toEqual(['aaaa', 'bbbb']); // 6 + 6 = 12 ≤ 13, third would be 18
  });

  it('always keeps at least one entry even when it alone exceeds the budget', () => {
    expect(withinByteBudget(['aaaaaaaa'], 1)).toEqual(['aaaaaaaa']);
    expect(withinByteBudget([], 1000)).toEqual([]);
  });

  it('bounds by real bytes: a CJK-heavy list is cut sooner than its UTF-16 length implies', () => {
    // Each entry serializes to 2 quotes + 4*3 = 14 UTF-8 bytes but only 6 UTF-16 units.
    const entries = ['一二三四', '五六七八', '九十百千'];
    // Budget 30 fits two (28) but not three (42) by UTF-8; by UTF-16 `.length` (6 each)
    // all three would have fit under 30 — proving the byte count governs.
    expect(withinByteBudget(entries, 30)).toEqual(['一二三四', '五六七八']);
  });
});
