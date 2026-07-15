import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { ImageInfo, SettingsData } from '@mbd/core/types';
import { ExcludedMatchers } from '@mbd/core/collection/filters';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';
import { useMediaEngine } from '@/extension/popup/hooks/useMediaEngine';

// enrichOriginals resolves through the active-tab bridge; stub it so the settings
// effect's resolveOriginals path runs without touching chrome.
vi.mock('@/extension/shared/active-tab/resolve-originals-active', () => ({
  requestResolveOriginals: vi.fn(async () => ({})),
}));
// getPageType is only reached when smartPageDefaults is on (kept off here).
vi.mock('@/extension/shared/active-tab/collect-active-tab', () => ({
  getPageType: vi.fn(async () => 'other'),
}));

const img = (src: string, extra: Partial<ImageInfo> = {}): ImageInfo => ({
  src, alt: '', width: 100, height: 100, type: 'jpeg',
  // fileSize > 0 so enrichImageSizes finds no HEAD targets (no network in the test).
  fileSize: 100, isBase64: false, kind: 'image', ...extra,
});

/** A deferred promise whose resolve is exposed, to hold a deep scan pending. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function harness(initial: Partial<SettingsData>, collectResult: ImageInfo[], deep: Promise<ImageInfo[]>) {
  let settings = { ...DEFAULT_SETTINGS, ...initial };
  const settingsRef = { current: settings } as RefObject<SettingsData>;
  const excludedRef = { current: { urls: { size: 0, has: () => false }, hosts: new Set<string>() } as unknown as ExcludedMatchers };
  const excludedMatch = excludedRef.current;
  const view = renderHook(
    ({ s }: { s: SettingsData }) =>
      useMediaEngine({
        settings: s,
        settingsRef,
        loadSettings: async () => s,
        excludedRef,
        excludedMatch,
        isDownloaded: () => false,
        downloadedSrcs: new Set<string>() as never,
        collect: async () => collectResult,
        deepScan: () => deep,
        abortDeepScan: () => {},
      }),
    { initialProps: { s: settings } },
  );
  return {
    view,
    // Re-render with a changed settings field → fires the settings effect (which
    // calls applyResolution → enrichOriginals when resolveOriginals is on).
    changeSettings: (patch: Partial<SettingsData>) => {
      settings = { ...settings, ...patch };
      settingsRef.current = settings;
      view.rerender({ s: settings });
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useMediaEngine — generation guards', () => {
  it('does NOT discard a deep-scan result when a mid-scan settings change fires enrichOriginals (resolveOriginals on)', async () => {
    const deep = deferred<ImageInfo[]>();
    const { view, changeSettings } = harness(
      { resolveOriginals: true, minimumImageSize: 0 },
      [img('https://x/a.jpg')],
      deep.promise,
    );

    // Let the mount scan settle (it runs enrichOriginals once).
    await act(async () => { await Promise.resolve(); });

    // Start the deep scan; it stays pending on `deep`.
    let scan!: Promise<void>;
    act(() => { scan = view.result.current.handleDeepScan(); });

    // Mid-scan, the user changes a setting in the still-reachable Settings panel.
    // This fires the settings effect → applyResolution → enrichOriginals, which
    // bumps its generation. It must NOT invalidate the running deep scan.
    await act(async () => { changeSettings({ minimumImageSize: 5 }); await Promise.resolve(); });

    // The deep scan resolves with newly-found media.
    await act(async () => {
      deep.resolve([img('https://x/deep.jpg')]);
      await scan;
    });

    // The deep-scan item must be merged in, not discarded by a spurious supersession.
    expect(view.result.current.state.images.map((i) => i.src)).toContain('https://x/deep.jpg');
  });

  it('DOES discard a deep-scan result when an actual rescan (fetchImages) supersedes it', async () => {
    const deep = deferred<ImageInfo[]>();
    const { view } = harness(
      { resolveOriginals: true },
      [img('https://x/a.jpg')],
      deep.promise,
    );
    await act(async () => { await Promise.resolve(); });

    let scan!: Promise<void>;
    act(() => { scan = view.result.current.handleDeepScan(); });

    // A real rescan (Rescan button) replaces rawImagesRef and bumps resolveGenRef.
    await act(async () => { await view.result.current.fetchImages(); });

    await act(async () => {
      deep.resolve([img('https://x/deep.jpg')]);
      await scan;
    });

    // The stale deep-scan result must NOT resurrect items the rescan dropped.
    expect(view.result.current.state.images.map((i) => i.src)).not.toContain('https://x/deep.jpg');
  });
});

describe('useMediaEngine — fetchImages self-supersession', () => {
  it('a stale fetchImages call does not clobber a newer overlapping one (double Rescan click)', async () => {
    const settingsRef = { current: DEFAULT_SETTINGS } as RefObject<SettingsData>;
    const excludedRef = {
      current: { urls: { size: 0, has: () => false }, hosts: new Set<string>() } as unknown as ExcludedMatchers,
    };

    // Each collect() call parks its resolver here instead of resolving immediately,
    // so the test can control the order in which overlapping fetchImages calls settle.
    const pending: Array<(v: ImageInfo[]) => void> = [];
    const collect = vi.fn(() => new Promise<ImageInfo[]>((resolve) => { pending.push(resolve); }));

    const view = renderHook(() =>
      useMediaEngine({
        settings: DEFAULT_SETTINGS,
        settingsRef,
        loadSettings: async () => DEFAULT_SETTINGS,
        excludedRef,
        excludedMatch: excludedRef.current,
        isDownloaded: () => false,
        downloadedSrcs: new Set<string>() as never,
        collect,
        deepScan: () => new Promise<ImageInfo[]>(() => {}),
        abortDeepScan: () => {},
      }),
    );

    // Let the mount effect fire its own fetchImages call, then resolve it (empty)
    // so it's out of the way before the two overlapping calls below.
    await act(async () => { await Promise.resolve(); });
    expect(pending).toHaveLength(1);
    await act(async () => { pending.shift()!([]); await Promise.resolve(); });

    // Fire two OVERLAPPING fetchImages calls (a double Rescan click — the button
    // isn't disabled while loading) — neither's collect() has resolved yet.
    let callA!: Promise<void>;
    let callB!: Promise<void>;
    act(() => {
      callA = view.result.current.fetchImages();
      callB = view.result.current.fetchImages();
    });
    expect(pending).toHaveLength(2);

    // The SECOND (fresher) call's collect() resolves FIRST...
    await act(async () => {
      pending[1]([img('https://x/fresh.jpg')]);
      await callB;
    });
    // ...then the FIRST (now-stale) call's collect() resolves LATER.
    await act(async () => {
      pending[0]([img('https://x/stale.jpg')]);
      await callA;
    });

    const srcs = view.result.current.state.images.map((i) => i.src);
    expect(srcs).toContain('https://x/fresh.jpg');
    expect(srcs).not.toContain('https://x/stale.jpg');
  });
});
