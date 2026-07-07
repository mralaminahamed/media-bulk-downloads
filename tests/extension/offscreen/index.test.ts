import { installOffscreenCaptureHost } from '@/extension/offscreen';

jest.mock('@/extension/shared/download/hls', () => ({
  captureHls: jest.fn(),
  HlsError: class HlsError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));

jest.mock('@/extension/shared/download/dash', () => ({
  captureDash: jest.fn(),
  DashError: class DashError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { captureHls, HlsError } = require('@/extension/shared/download/hls');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { captureDash, DashError } = require('@/extension/shared/download/dash');

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

function getListener(): Listener {
  return (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0] as Listener;
}

describe('offscreen capture host', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { URL: { createObjectURL: jest.Mock; revokeObjectURL: jest.Mock } }).URL = {
      createObjectURL: jest.fn(() => 'blob:test'),
      revokeObjectURL: jest.fn(),
    };
    installOffscreenCaptureHost();
  });

  it('ignores non-CAPTURE_RUN messages', () => {
    const sendResponse = jest.fn();
    const ret = getListener()({ type: 'SOMETHING_ELSE' }, {}, sendResponse);
    expect(ret).toBeUndefined();
    expect(captureHls).not.toHaveBeenCalled();
  });

  it('runs captureHls with the manifest + policy, broadcasts progress, returns the blob URL', async () => {
    (captureHls as jest.Mock).mockImplementation(async (_url: string, deps: { onProgress?: (d: number, t: number) => void }) => {
      deps.onProgress?.(3, 7);
      return { bytes: new Uint8Array([1, 2, 3]), ext: 'mp4', mime: 'video/mp4', segmentCount: 5, muxedAudio: true };
    });
    const sendResponse = jest.fn();
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
    (captureHls as jest.Mock).mockRejectedValue(new HlsError('too-large'));
    const sendResponse = jest.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'hls', manifestUrl: 'https://x/m.m3u8', quality: 720, maxBytes: 1 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, code: 'too-large' });
  });

  it('runs captureDash for engine:dash and returns the blob URL', async () => {
    (captureDash as jest.Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ext: 'mp4', mime: 'video/mp4', segmentCount: 4, muxedAudio: true });
    const sendResponse = jest.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'dash', manifestUrl: 'https://x/m.mpd', quality: 720, maxBytes: 1000 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(captureDash).toHaveBeenCalledWith('https://x/m.mpd', expect.anything(), { quality: 720, maxBytes: 1000 });
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: true, blobUrl: 'blob:test', ext: 'mp4', muxedAudio: true }));
  });

  it('returns the DashError code on failure', async () => {
    (captureDash as jest.Mock).mockRejectedValue(new DashError('drm'));
    const sendResponse = jest.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'dash', manifestUrl: 'https://x/m.mpd', quality: 720, maxBytes: 1 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, code: 'drm' });
  });

  it('still runs captureHls for engine:hls', async () => {
    (captureHls as jest.Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ext: 'ts', mime: 'video/mp2t', segmentCount: 2, muxedAudio: false });
    const sendResponse = jest.fn();
    getListener()({ type: 'CAPTURE_RUN', runId: 'run-1', engine: 'hls', manifestUrl: 'https://x/m.m3u8', quality: 720, maxBytes: 1000 }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(captureHls).toHaveBeenCalled();
  });
});
