import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamVariants } from '@/extension/popup/hooks/useStreamVariants';

beforeEach(() => {
  (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
    ok: true, variants: [{ height: 1080, bandwidth: 5_000_000, label: '1080p · 5.0 Mbps' }],
  });
});

describe('useStreamVariants', () => {
  it('sends LIST_VARIANTS once on ensure and stores the result', async () => {
    const { result } = renderHook(() => useStreamVariants());
    act(() => result.current.ensure('https://cdn.test/a.m3u8', 'hls'));
    await waitFor(() => expect(result.current.states.get('https://cdn.test/a.m3u8')?.status).toBe('done'));
    expect(result.current.states.get('https://cdn.test/a.m3u8')?.variants).toHaveLength(1);
    // A second ensure for the same URL does not refetch.
    act(() => result.current.ensure('https://cdn.test/a.m3u8', 'hls'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('marks the manifest errored when the response is not ok', async () => {
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, code: 'x' });
    const { result } = renderHook(() => useStreamVariants());
    act(() => result.current.ensure('https://cdn.test/b.m3u8', 'hls'));
    await waitFor(() => expect(result.current.states.get('https://cdn.test/b.m3u8')?.status).toBe('error'));
  });

  it('sends LIST_VARIANTS once across two hook instances for the same URL', async () => {
    // Fresh URL — the module-level cache persists across cases, so a reused URL
    // would be served from cache and never hit sendMessage at all.
    const url = 'https://cdn.test/c.m3u8';
    const a = renderHook(() => useStreamVariants());
    const b = renderHook(() => useStreamVariants());
    // Both instances ask for the same manifest before the first fetch resolves.
    act(() => {
      a.result.current.ensure(url, 'hls');
      b.result.current.ensure(url, 'hls');
    });
    await waitFor(() => expect(a.result.current.states.get(url)?.status).toBe('done'));
    await waitFor(() => expect(b.result.current.states.get(url)?.status).toBe('done'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
