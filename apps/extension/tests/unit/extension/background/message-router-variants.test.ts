import { describe, it, expect, vi, afterEach } from 'vitest';
import { messageRouter } from '@/extension/background/message-router';
import type { ListVariantsMessage, ListVariantsResult } from '@mbd/core/types';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6221600,RESOLUTION=1920x1080
high/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=836280,RESOLUTION=848x480
mid/index.m3u8
`;

function invoke(msg: ListVariantsMessage): Promise<ListVariantsResult> {
  return new Promise((resolve) => {
    messageRouter.LIST_VARIANTS!(msg, {} as chrome.runtime.MessageSender, resolve as (r: unknown) => void);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('messageRouter.LIST_VARIANTS', () => {
  it('fetches an HLS master and returns its renditions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(MASTER) }));
    const res = await invoke({ type: 'LIST_VARIANTS', manifestUrl: 'https://cdn.test/master.m3u8', engine: 'hls' });
    expect(res).toEqual({ ok: true, variants: expect.arrayContaining([expect.objectContaining({ height: 1080 })]) });
    expect((res as { variants: unknown[] }).variants).toHaveLength(2);
  });

  it('returns ok:false when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const res = await invoke({ type: 'LIST_VARIANTS', manifestUrl: 'https://cdn.test/x.m3u8', engine: 'hls' });
    expect(res.ok).toBe(false);
  });

  it('rejects an internal-host manifestUrl without fetching (SSRF guard)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await invoke({ type: 'LIST_VARIANTS', manifestUrl: 'http://169.254.169.254/master.m3u8', engine: 'hls' });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches with redirect:"error" so a public host cannot 3xx-redirect to an internal one', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ text: () => Promise.resolve(MASTER) });
    vi.stubGlobal('fetch', fetchSpy);
    await invoke({ type: 'LIST_VARIANTS', manifestUrl: 'https://cdn.test/master.m3u8', engine: 'hls' });
    expect(fetchSpy).toHaveBeenCalledWith('https://cdn.test/master.m3u8', { redirect: 'error' });
  });
});
