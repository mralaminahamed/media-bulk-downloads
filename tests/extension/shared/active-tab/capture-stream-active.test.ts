import { requestCaptureStream } from '@/extension/shared/active-tab/capture-stream-active';
import { ImageInfo } from '@/types';

const item = { src: 'https://x/m.m3u8', hlsManifest: 'https://x/m.m3u8', type: 'm3u8', kind: 'video', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' } as ImageInfo;

describe('requestCaptureStream', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends CAPTURE_STREAM, relays progress, resolves the status, and unsubscribes', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_msg, cb) => cb({ status: 'Captured foo.mp4 — 5 segments.' }));
    const onProgress = jest.fn();

    const promise = requestCaptureStream('https://x/m.m3u8', item, { url: 'https://x/watch' }, onProgress);

    // The helper registered a progress listener; drive a progress broadcast through it.
    const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls.at(-1)![0];
    listener({ type: 'CAPTURE_PROGRESS', done: 2, total: 4 });
    expect(onProgress).toHaveBeenCalledWith(2, 4);

    await expect(promise).resolves.toBe('Captured foo.mp4 — 5 segments.');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAPTURE_STREAM', manifestUrl: 'https://x/m.m3u8', item, sourcePage: { url: 'https://x/watch' } }),
      expect.any(Function),
    );
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
  });

  it('ignores non-progress messages on its listener', () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => undefined);
    const onProgress = jest.fn();
    void requestCaptureStream('https://x/m.m3u8', item, { url: 'https://x/watch' }, onProgress);
    const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls.at(-1)![0];
    listener({ type: 'SOMETHING_ELSE' });
    expect(onProgress).not.toHaveBeenCalled();
  });
});
