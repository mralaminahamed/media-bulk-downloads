import { describe, it, expect, vi, beforeEach } from 'vitest';

// The entrypoint calls installResponseSniffer + installReplayOnReady; spy on them
// to assert the wiring (isApi gate, guard, envelope) rather than re-patching fetch.
vi.mock('@mbd/core/resolvers/sniffers/response-sniffer', () => ({
  installResponseSniffer: vi.fn(),
  makeSnifferEmit: vi.fn((opts) => opts), // return opts so we can inspect guard/extract/envelope
  installReplayOnReady: vi.fn(),
}));

import { installResponseSniffer, makeSnifferEmit, installReplayOnReady } from '@mbd/core/resolvers/sniffers/response-sniffer';
import sniffer from '@/entrypoints/pinterest-media-sniffer.content';

describe('pinterest-media-sniffer entrypoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declares MAIN world, document_start, and Pinterest matches', () => {
    expect(sniffer.world).toBe('MAIN');
    expect(sniffer.runAt).toBe('document_start');
    expect(sniffer.matches).toContain('*://*.pinterest.com/*');
  });

  it('installs a /resource/ sniffer with the images/video_list guard and mbd-pinterest-media envelope', () => {
    (sniffer.main as () => void)();
    expect(installResponseSniffer).toHaveBeenCalledTimes(1);
    const arg = (installResponseSniffer as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    expect(arg.isApi('https://www.pinterest.com/resource/BoardFeedResource/get/?x=1')).toBe(true);
    expect(arg.isApi('https://www.pinterest.com/pin/123/')).toBe(false);
    const emit = (makeSnifferEmit as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    expect(emit.guard('… "images": {…}')).toBe(true);
    expect(emit.guard('nope')).toBe(false);
    expect(emit.envelope([{ pinId: '1' }])).toEqual({ source: 'mbd-pinterest-media', entries: [{ pinId: '1' }] });
    expect(installReplayOnReady).toHaveBeenCalledWith('mbd-pinterest-ready', expect.any(Function));
  });

  // The buffer is built with a loop (`for (const e of entries) buffer.push(e)`),
  // not `buffer.push(...entries)` — entries crosses the MAIN->isolated boundary
  // from an untrusted page and can be arbitrarily large; spreading it as call
  // args risks a RangeError (silently dropping the whole batch since this sits
  // inside the sniffer's try/catch). Feed one very large batch in a single call
  // and confirm it doesn't throw and all (capped) entries make it through.
  it('buffers a single very large batch without throwing (loop-push, not push(...spread))', () => {
    const posted: Array<{ entries: Array<{ pinId: string }> }> = [];
    (window.postMessage as unknown) = vi.fn((m: unknown) => posted.push(m as never));
    (sniffer.main as () => void)();
    const emit = (makeSnifferEmit as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    const replay = (installReplayOnReady as unknown as { mock: { calls: any[][] } }).mock.calls[0][1] as () => void;

    const bigBatch = Array.from({ length: 200_000 }, (_, i) => ({ pinId: String(i) }));
    expect(() => emit.envelope(bigBatch)).not.toThrow();

    replay();
    const drained = posted.at(-1)!.entries;
    expect(drained).toHaveLength(8000); // capped
    expect(drained.at(-1)).toEqual({ pinId: '199999' }); // newest survives the cap
  });

  it('does not buffer entries emitted after the relay is ready (no double replay)', () => {
    const posted: unknown[] = [];
    (window.postMessage as unknown) = vi.fn((m: unknown) => posted.push(m));
    (sniffer.main as () => void)();
    const emit = (makeSnifferEmit as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    const replay = (installReplayOnReady as unknown as { mock: { calls: any[][] } }).mock.calls[0][1] as () => void;

    // Before the relay is ready, entries are buffered.
    emit.envelope([{ pinId: '1' }]);
    emit.envelope([{ pinId: '2' }]);
    replay();
    expect(posted).toContainEqual({ source: 'mbd-pinterest-media', entries: [{ pinId: '1' }, { pinId: '2' }] });

    // After ready, the buffer is drained, and further emits are not buffered.
    posted.length = 0;
    emit.envelope([{ pinId: '3' }]); // post-ready -> live only, not buffered
    replay(); // buffer empty -> no stale re-post
    expect(posted).toHaveLength(0);
  });
});
