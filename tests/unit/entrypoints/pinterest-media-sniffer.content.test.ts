import { describe, it, expect, vi, beforeEach } from 'vitest';

// The entrypoint calls installResponseSniffer + installReplayOnReady; spy on them
// to assert the wiring (isApi gate, guard, envelope) rather than re-patching fetch.
vi.mock('@/extension/shared/resolvers/sniffers/response-sniffer', () => ({
  installResponseSniffer: vi.fn(),
  makeSnifferEmit: vi.fn((opts) => opts), // return opts so we can inspect guard/extract/envelope
  installReplayOnReady: vi.fn(),
}));

import { installResponseSniffer, makeSnifferEmit, installReplayOnReady } from '@/extension/shared/resolvers/sniffers/response-sniffer';
import sniffer from '@/entrypoints/pinterest-media-sniffer.content';

describe('pinterest-media-sniffer entrypoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declares MAIN world, document_start, and Pinterest matches', () => {
    expect(sniffer.world).toBe('MAIN');
    expect(sniffer.runAt).toBe('document_start');
    expect(sniffer.matches).toContain('*://*.pinterest.com/*');
  });

  it('installs a /resource/ sniffer with the images/video_list guard and ibd-pinterest-media envelope', () => {
    (sniffer.main as () => void)();
    expect(installResponseSniffer).toHaveBeenCalledTimes(1);
    const arg = (installResponseSniffer as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    expect(arg.isApi('https://www.pinterest.com/resource/BoardFeedResource/get/?x=1')).toBe(true);
    expect(arg.isApi('https://www.pinterest.com/pin/123/')).toBe(false);
    const emit = (makeSnifferEmit as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    expect(emit.guard('… "images": {…}')).toBe(true);
    expect(emit.guard('nope')).toBe(false);
    expect(emit.envelope([{ pinId: '1' }])).toEqual({ source: 'ibd-pinterest-media', entries: [{ pinId: '1' }] });
    expect(installReplayOnReady).toHaveBeenCalledWith('ibd-pinterest-ready', expect.any(Function));
  });
});
