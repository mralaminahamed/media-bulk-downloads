import type { Mock } from 'vitest';
import { newCaptureRunId, requestCaptureStream } from '@/extension/shared/active-tab/capture-stream-active';
import { ImageInfo } from '@mbd/core/types';

describe('newCaptureRunId', () => {
  it('returns a non-empty, unique id each call (no crypto.randomUUID — runs in http content scripts)', () => {
    const a = newCaptureRunId();
    const b = newCaptureRunId();
    expect(a).toMatch(/^cap-/);
    expect(a).not.toBe(b);
  });
});

const item = { src: 'https://x/m.m3u8', hlsManifest: 'https://x/m.m3u8', type: 'm3u8', kind: 'video', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' } as ImageInfo;

describe('requestCaptureStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends CAPTURE_STREAM, relays only its own runId progress, resolves the status, and unsubscribes', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_msg, cb) => cb({ status: 'Captured foo.mp4 — 5 segments.' }));
    const onProgress = vi.fn();

    const promise = requestCaptureStream(item, { url: 'https://x/watch' }, onProgress);

    // The runId the helper minted, read off the CAPTURE_STREAM it sent.
    const sent = (chrome.runtime.sendMessage as Mock).mock.calls.find((c) => c[0]?.type === 'CAPTURE_STREAM')![0];
    expect(typeof sent.runId).toBe('string');
    const listener = (chrome.runtime.onMessage.addListener as Mock).mock.calls.at(-1)![0];

    // A concurrent capture's progress (different runId) is ignored…
    listener({ type: 'CAPTURE_PROGRESS', runId: 'other-run', done: 9, total: 9 });
    expect(onProgress).not.toHaveBeenCalled();
    // …only this capture's own runId relays.
    listener({ type: 'CAPTURE_PROGRESS', runId: sent.runId, done: 2, total: 4 });
    expect(onProgress).toHaveBeenCalledWith(2, 4);

    await expect(promise).resolves.toEqual({ status: 'Captured foo.mp4 — 5 segments.', refusal: undefined });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAPTURE_STREAM', item, sourcePage: { url: 'https://x/watch' } }),
      expect.any(Function),
    );
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
  });

  it('ignores non-progress messages on its listener', () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation(() => undefined);
    const onProgress = vi.fn();
    void requestCaptureStream(item, { url: 'https://x/watch' }, onProgress);
    const listener = (chrome.runtime.onMessage.addListener as Mock).mock.calls.at(-1)![0];
    listener({ type: 'SOMETHING_ELSE' });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('resolves to a fallback status when the background sends no response (e.g. disconnected)', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_msg, cb) => cb(undefined));

    const promise = requestCaptureStream(item, { url: 'https://x/watch' }, vi.fn());

    await expect(promise).resolves.toEqual({ status: 'Couldn’t capture the stream.', refusal: undefined });
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
  });

  it('passes a refusal through so the popup can offer the copy-command handoff (#285)', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_msg, cb) =>
      cb({ status: 'This stream is DRM-protected and can’t be captured.', refusal: { code: 'drm' } }),
    );
    const promise = requestCaptureStream(item, { url: 'https://x/watch' }, vi.fn());
    await expect(promise).resolves.toEqual({
      status: 'This stream is DRM-protected and can’t be captured.',
      refusal: { code: 'drm' },
    });
  });
});
