import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { usePerHostSettings } from '@/extension/popup/hooks/usePerHostSettings';

const src = (url: string) => () => Promise.resolve({ url });

describe('usePerHostSettings', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue(undefined);
  });

  it('resolves the registrable host and loads its override into effective', async () => {
    await chrome.storage.local.set({ perHostSettings: { 'booru.example': { minimumImageSize: 1024 } } });
    const global = { ...DEFAULT_SETTINGS, minimumImageSize: 0 };
    const { result } = renderHook(() => usePerHostSettings(src('https://img.booru.example/p/1'), global));
    await waitFor(() => expect(result.current.host).toBe('booru.example'));
    expect(result.current.hasOverride).toBe(true);
    expect(result.current.effective.minimumImageSize).toBe(1024);
    expect(result.current.effectiveRef.current.minimumImageSize).toBe(1024);
  });

  it('no override → effective === global, hasOverride false', async () => {
    const global = { ...DEFAULT_SETTINGS, minimumImageSize: 42 };
    const { result } = renderHook(() => usePerHostSettings(src('https://plain.example/'), global));
    await waitFor(() => expect(result.current.host).toBe('plain.example'));
    expect(result.current.hasOverride).toBe(false);
    expect(result.current.effective.minimumImageSize).toBe(42);
  });

  it('saveForThisSite sends an allowlisted patch and updates optimistically', async () => {
    const global = { ...DEFAULT_SETTINGS, minimumImageSize: 0 };
    const { result } = renderHook(() => usePerHostSettings(src('https://booru.example/'), global));
    await waitFor(() => expect(result.current.host).toBe('booru.example'));
    act(() => result.current.saveForThisSite({ ...global, minimumImageSize: 800, downloadPath: 'x' } as never));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SET_PER_HOST_SETTINGS', host: 'booru.example', patch: expect.objectContaining({ minimumImageSize: 800 }),
    });
    // non-allowlisted field never leaves the popup
    const sent = (chrome.runtime.sendMessage as Mock).mock.calls[0][0];
    expect(sent.patch.downloadPath).toBeUndefined();
    await waitFor(() => expect(result.current.hasOverride).toBe(true));
    expect(result.current.effective.minimumImageSize).toBe(800);
  });

  it('resetThisSite sends a null patch and clears optimistically', async () => {
    await chrome.storage.local.set({ perHostSettings: { 'booru.example': { excludeEmoji: true } } });
    const { result } = renderHook(() => usePerHostSettings(src('https://booru.example/'), DEFAULT_SETTINGS));
    await waitFor(() => expect(result.current.hasOverride).toBe(true));
    act(() => result.current.resetThisSite());
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'SET_PER_HOST_SETTINGS', host: 'booru.example', patch: null });
    await waitFor(() => expect(result.current.hasOverride).toBe(false));
  });

  it('empty host (no tab url) never sends and has no override', async () => {
    const { result } = renderHook(() => usePerHostSettings(src(''), DEFAULT_SETTINGS));
    await waitFor(() => expect(result.current.host).toBe(''));
    act(() => result.current.saveForThisSite({ ...DEFAULT_SETTINGS, minimumImageSize: 900 }));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
