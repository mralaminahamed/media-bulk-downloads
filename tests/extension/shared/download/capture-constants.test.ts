import { HLS_MAX_BYTES, HLS_TARGET_HEIGHT } from '@/extension/shared/download/capture-constants';

describe('capture-constants', () => {
  it('caps assembled bytes at 1 GB', () => {
    expect(HLS_MAX_BYTES).toBe(1024 * 1024 * 1024);
  });
  it('targets 720p by default', () => {
    expect(HLS_TARGET_HEIGHT).toBe(720);
  });
});
