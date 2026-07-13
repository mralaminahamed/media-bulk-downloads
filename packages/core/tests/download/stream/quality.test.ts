import { streamQualityToEngine } from '@mbd/core/download/stream/quality';
import { STREAM_TARGET_HEIGHT } from '@mbd/core/download/stream/capture-constants';

describe('streamQualityToEngine', () => {
  it('maps auto to the target-height default (no behaviour change)', () => {
    expect(streamQualityToEngine('auto')).toBe(STREAM_TARGET_HEIGHT);
  });

  it('maps best/worst to the bandwidth extremes', () => {
    expect(streamQualityToEngine('best')).toBe('highest');
    expect(streamQualityToEngine('worst')).toBe('lowest');
  });

  it('maps a numeric tier to that exact height', () => {
    expect(streamQualityToEngine('1080')).toBe(1080);
    expect(streamQualityToEngine('720')).toBe(720);
    expect(streamQualityToEngine('480')).toBe(480);
  });

  it('falls back to the auto target for a corrupt/legacy value', () => {
    expect(streamQualityToEngine('garbage' as never)).toBe(STREAM_TARGET_HEIGHT);
  });
});
