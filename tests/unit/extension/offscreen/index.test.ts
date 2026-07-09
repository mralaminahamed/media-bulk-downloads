import type { Mock } from 'vitest';
import { installOffscreenCaptureHost } from '@/extension/offscreen';

vi.mock('@/extension/shared/download/stream/hls', () => ({
  captureHls: vi.fn(),
  HlsError: class HlsError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));

vi.mock('@/extension/shared/download/stream/dash', () => ({
  captureDash: vi.fn(),
  DashError: class DashError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));

// vi.mock is hoisted, so these static imports resolve to the mocked modules above.
import { captureHls, HlsError } from '@/extension/shared/download/stream/hls';
import { captureDash, DashError } from '@/extension/shared/download/stream/dash';

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

function getListener(): Listener {
  return (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0] as Listener;
}

describe('offscreen capture host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as unknown as { URL: { createObjectURL: Mock; revokeObjectURL: Mock } }).URL = {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    };
    installOffscreenCaptureHost();
  });

  it('ignores non-CAPTURE_RUN messages', () => {
    const sendResponse = vi.fn();
    const ret = getListener()({ type: 'SOMETHING_ELSE' }, {}, sendResponse);
    expect(ret).toBeUndefined();
    expect(captureHls).not.toHaveBeenCalled();
  });

  it('runs captureHls with the manifest + policy, broadcasts progress, returns the blob URL', async () => {
    (captureHls as Mock).mockImplementation(async (_url: string, deps: { onProgress?: (d: number, t: number) => void }) => {
      deps.onProgress?.(3, 7);
      return { bytes: new Uint8Array([1, 2, 3]), ext: 'mp4', mime: 'video/mp4', segmentCount: 5, muxedAudio: true };
    });
    const sendResponse = vi.fn();
    const ret = getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'hls', manifestUrl: 'https://x/m.m3u8', quality: 720, maxBytes: 1000 }, {}, sendResponse);
    expect(ret).toBe(true); // async response
    await new Promise((r) => setTimeout(r, 0));

    expect(captureHls).toHaveBeenCalledWith('https://x/m.m3u8', expect.anything(), { quality: 720, maxBytes: 1000 });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_PROGRESS', runId: 'run-1', done: 3, total: 7 });
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true, blobUrl: 'blob:test', ext: 'mp4', segmentCount: 5, muxedAudio: true,
    });
  });

  it('returns the error code when the engine throws HlsError', async () => {
    (captureHls as Mock).mockRejectedValue(new HlsError('too-large', ''));
    const sendResponse = vi.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'hls', manifestUrl: 'https://x/m.m3u8', quality: 720, maxBytes: 1 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, code: 'too-large' });
  });

  it('runs captureDash for engine:dash and returns the blob URL', async () => {
    (captureDash as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ext: 'mp4', mime: 'video/mp4', segmentCount: 4, muxedAudio: true });
    const sendResponse = vi.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'dash', manifestUrl: 'https://x/m.mpd', quality: 720, maxBytes: 1000 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(captureDash).toHaveBeenCalledWith('https://x/m.mpd', expect.anything(), { quality: 720, maxBytes: 1000 });
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: true, blobUrl: 'blob:test', ext: 'mp4', muxedAudio: true }));
  });

  it('returns the DashError code on failure', async () => {
    (captureDash as Mock).mockRejectedValue(new DashError('drm', ''));
    const sendResponse = vi.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'dash', manifestUrl: 'https://x/m.mpd', quality: 720, maxBytes: 1 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, code: 'drm' });
  });

  it('still runs captureHls for engine:hls', async () => {
    (captureHls as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ext: 'ts', mime: 'video/mp2t', segmentCount: 2, muxedAudio: false });
    const sendResponse = vi.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'hls', manifestUrl: 'https://x/m.m3u8', quality: 720, maxBytes: 1000 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(captureHls).toHaveBeenCalled();
  });
});
