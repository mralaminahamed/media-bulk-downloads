import { describe, it, expect } from 'vitest';
import { jsonByteSize, withinByteBudget } from '@mbd/storage/byte-budget';

describe('jsonByteSize — UTF-8 byte length of the JSON', () => {
  it('counts ASCII as one byte each', () => {
    expect(jsonByteSize('ab')).toBe(4);
  });

  it('counts multi-byte characters by their UTF-8 size, not UTF-16 code units', () => {
    expect(jsonByteSize('世界')).toBe(2 + 3 + 3);
    expect(jsonByteSize('🚀')).toBe(2 + 4);
    expect(JSON.stringify('世界').length).toBeLessThan(jsonByteSize('世界'));
    expect(JSON.stringify('🚀').length).toBeLessThan(jsonByteSize('🚀'));
  });
});

describe('withinByteBudget', () => {
  it('keeps leading entries until the cumulative UTF-8 budget is exceeded', () => {
    const entries = ['aaaa', 'bbbb', 'cccc'];
    expect(withinByteBudget(entries, 13)).toEqual(['aaaa', 'bbbb']);
  });

  it('always keeps at least one entry even when it alone exceeds the budget', () => {
    expect(withinByteBudget(['aaaaaaaa'], 1)).toEqual(['aaaaaaaa']);
    expect(withinByteBudget([], 1000)).toEqual([]);
  });

  it('bounds by real bytes: a CJK-heavy list is cut sooner than its UTF-16 length implies', () => {
    const entries = ['一二三四', '五六七八', '九十百千'];
    expect(withinByteBudget(entries, 30)).toEqual(['一二三四', '五六七八']);
  });
});
