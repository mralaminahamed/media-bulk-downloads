import type { Mock } from 'vitest';
import { scheduleSidecar, __resetSidecarWriter } from '@/extension/background/download/sidecar-writer';

/** The most recently registered chrome.downloads.onChanged handler (the writer's). */
const onChanged = (): ((d: unknown) => void) => {
  const calls = (chrome.downloads.onChanged.addListener as Mock).mock.calls;
  return calls[calls.length - 1][0];
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const jsonCall = () =>
  (chrome.downloads.download as Mock).mock.calls.find((c) => String(c[0].filename).endsWith('.json'));

describe('sidecar-writer — completion-driven, filename-matched (#284, I6)', () => {
  beforeEach(() => {
    __resetSidecarWriter();
    (chrome.downloads.onChanged.addListener as Mock).mockClear();
    (chrome.downloads.download as Mock).mockClear();
    (chrome.downloads.search as Mock).mockReset().mockResolvedValue([]);
  });

  it("names the sidecar from the media file's ACTUAL (uniquified) name, not the requested one", async () => {
    (chrome.downloads.search as Mock).mockResolvedValueOnce([{ id: 7, filename: '/home/u/Downloads/image_1 (1).jpg' }]);
    scheduleSidecar(7, 'image_1.jpg', '{"pageUrl":"https://s/p"}');

    onChanged()({ id: 7, state: { current: 'complete' } });
    await flush();

    const call = jsonCall();
    expect(call).toBeTruthy();
    expect(call![0].filename).toBe('image_1 (1).jpg.json');
    expect(call![0].saveAs).toBe(false);
    expect(call![0].conflictAction).toBe('uniquify');
    expect(String(call![0].url)).toMatch(/^data:application\/json;base64,/);
  });

  it("keeps the media's subfolder and reuses it for the sidecar", async () => {
    (chrome.downloads.search as Mock).mockResolvedValueOnce([{ id: 3, filename: '/home/u/Downloads/Pics/2024/photo (2).png' }]);
    scheduleSidecar(3, 'Pics/2024/photo.png', '{}');

    onChanged()({ id: 3, state: { current: 'complete' } });
    await flush();

    expect(jsonCall()![0].filename).toBe('Pics/2024/photo (2).png.json');
  });

  it('does NOT write a sidecar when the media download is interrupted (nothing to pair)', async () => {
    scheduleSidecar(9, 'x.jpg', '{}');
    onChanged()({ id: 9, state: { current: 'interrupted' } });
    await flush();
    expect(jsonCall()).toBeUndefined();
    expect(chrome.downloads.search as Mock).not.toHaveBeenCalled();
  });

  it('ignores completion events for downloads it did not schedule', async () => {
    scheduleSidecar(1, 'a.jpg', '{}');
    onChanged()({ id: 999, state: { current: 'complete' } });
    await flush();
    expect(jsonCall()).toBeUndefined();
  });

  it('writes each scheduled sidecar at most once (drained on first terminal event)', async () => {
    (chrome.downloads.search as Mock).mockResolvedValue([{ id: 5, filename: '/d/a.jpg' }]);
    scheduleSidecar(5, 'a.jpg', '{}');
    onChanged()({ id: 5, state: { current: 'complete' } });
    onChanged()({ id: 5, state: { current: 'complete' } });
    await flush();
    const jsonCalls = (chrome.downloads.download as Mock).mock.calls.filter((c) => String(c[0].filename).endsWith('.json'));
    expect(jsonCalls).toHaveLength(1);
  });
});
