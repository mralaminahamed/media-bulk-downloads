import { STREAM_MAX_BYTES, STREAM_TARGET_HEIGHT } from '@/extension/shared/download/capture-constants';

describe('capture-constants', () => {
  it('caps assembled bytes at 1 GB', () => {
    expect(STREAM_MAX_BYTES).toBe(1024 * 1024 * 1024);
  });
  it('targets 720p by default', () => {
    expect(STREAM_TARGET_HEIGHT).toBe(720);
  });
});
