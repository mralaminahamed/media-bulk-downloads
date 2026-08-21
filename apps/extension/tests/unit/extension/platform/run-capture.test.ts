/** @vitest-environment jsdom */
import type { CaptureRunRequest } from '@mbd/platform';

const { captureHls, captureDash, HlsError, DashError } = vi.hoisted(() => {
  class HlsError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  class DashError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  return { captureHls: vi.fn(), captureDash: vi.fn(), HlsError, DashError };
});

vi.mock('@mbd/core/download/stream/hls', () => ({ captureHls, HlsError }));
vi.mock('@mbd/core/download/stream/dash', () => ({ captureDash, DashError }));
vi.mock('@mbd/core/download/stream/hls-webcrypto', () => ({ browserHlsDeps: () => ({}) }));
vi.mock('@mbd/core/download/stream/dash-fetch', () => ({ browserDashDeps: () => ({}) }));

import { runCaptureInProcess } from '@/extension/platform/run-capture';

const req = (over: Partial<CaptureRunRequest> = {}): CaptureRunRequest => ({
  runId: 'r1', manifestUrl: 'https://cdn/master.m3u8', engine: 'hls', quality: 720, maxBytes: 1e9, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

const result = () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'video/mp4', ext: 'mp4', segmentCount: 4, muxedAudio: true });

it('assembles an HLS stream into an object URL', async () => {
  captureHls.mockResolvedValue(result());
  const r = await runCaptureInProcess(req());
  expect(captureHls).toHaveBeenCalledTimes(1);
  expect(r).toEqual({ ok: true, blobUrl: 'blob:mock', ext: 'mp4', segmentCount: 4, muxedAudio: true });
});

it('dispatches to the DASH engine when engine is dash', async () => {
  captureDash.mockResolvedValue({ ...result(), muxedAudio: false });
  const r = await runCaptureInProcess(req({ engine: 'dash' }));
  expect(captureDash).toHaveBeenCalledTimes(1);
  expect(captureHls).not.toHaveBeenCalled();
  expect(r).toEqual({ ok: true, blobUrl: 'blob:mock', ext: 'mp4', segmentCount: 4, muxedAudio: false });
});

it('maps a typed HlsError to its code', async () => {
  captureHls.mockRejectedValue(new HlsError('encrypted'));
  expect(await runCaptureInProcess(req())).toEqual({ ok: false, code: 'encrypted' });
});

it('maps an untyped throw to code "unknown"', async () => {
  captureHls.mockRejectedValue(new Error('boom'));
  expect(await runCaptureInProcess(req())).toEqual({ ok: false, code: 'unknown' });
});
