import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { AppState, FilterOptions, ImageInfo, SettingsData } from '@mbd/core/types';
import { ExcludedMatchers } from '@mbd/core/collection/filters';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';
import { DEFAULT_FILTERS } from '@/extension/popup/components/FilterToolbar';
import { useNearDuplicates } from '@/extension/popup/hooks/useNearDuplicates';

const HASH_TABLE = new Map<string, string>();

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(msg: { id: string }): void {
    queueMicrotask(() => {
      const pHash = HASH_TABLE.get(msg.id);
      const data = pHash === undefined ? { type: 'HASH_ERROR', id: msg.id } : { type: 'HASHED', id: msg.id, pHash };
      this.onmessage?.({ data } as MessageEvent);
    });
  }
  terminate(): void {}
}

const hooks = vi.hoisted(() => ({ onFetch: null as null | ((src: string) => void) }));
vi.mock('@/extension/popup/utils', async (orig) => ({
  ...(await orig<typeof import('@/extension/popup/utils')>()),
  fetchImageBytes: vi.fn(async (src: string) => { hooks.onFetch?.(src); return new ArrayBuffer(8); }),
}));

const img = (src: string, extra: Partial<ImageInfo> = {}): ImageInfo => ({
  src,
  alt: '',
  width: 0,
  height: 0,
  type: 'jpeg',
  fileSize: 0,
  isBase64: false,
  kind: 'image',
  ...extra,
});

function harness(images: ImageInfo[], threshold = 8) {
  const rawImagesRef = { current: images } as RefObject<ImageInfo[]>;
  const settingsRef = { current: { ...DEFAULT_SETTINGS, nearDuplicateThreshold: threshold } } as RefObject<SettingsData>;
  const excludedRef = { current: { urls: { size: 0, has: () => false }, hosts: new Set<string>() } as unknown as ExcludedMatchers };
  const filtersRef = { current: { ...DEFAULT_FILTERS } as FilterOptions } as RefObject<FilterOptions>;
  let appState: AppState = { status: '', images, filteredImages: images, isLoading: false };
  const setState = vi.fn((updater: AppState | ((p: AppState) => AppState)) => {
    appState = typeof updater === 'function' ? (updater as (p: AppState) => AppState)(appState) : updater;
  });
  const view = renderHook(() =>
    useNearDuplicates({ rawImagesRef, settingsRef, excludedRef, filtersRef, isDownloaded: () => false, setState }),
  );
  return { view, rawImagesRef, getState: () => appState };
}

beforeEach(() => {
  HASH_TABLE.clear();
  hooks.onFetch = null;
  vi.stubGlobal('Worker', FakeWorker);
});

describe('useNearDuplicates', () => {
  it('marks the smaller copy of a near-duplicate cluster and hides it from the filtered view', async () => {
    HASH_TABLE.set('https://x/thumb.jpg', '0000000000000000');
    HASH_TABLE.set('https://x/orig.jpg', '0000000000000001');
    const images = [
      img('https://x/thumb.jpg', { width: 320, height: 240, mediaKey: 'a' }),
      img('https://x/orig.jpg', { width: 2048, height: 1536, mediaKey: 'a' }),
    ];
    const { view, rawImagesRef, getState } = harness(images);

    await act(async () => {
      await view.result.current.run();
    });

    const raw = rawImagesRef.current;
    expect(raw.find((i) => i.src.endsWith('orig.jpg'))?.nearDuplicate).toBe(false);
    expect(raw.find((i) => i.src.endsWith('thumb.jpg'))?.nearDuplicate).toBe(true);
    expect(getState().filteredImages.map((i) => i.src)).toEqual(['https://x/orig.jpg']);
    expect(view.result.current.running).toBe(false);
  });

  it('leaves distinct images untouched', async () => {
    HASH_TABLE.set('https://x/a.jpg', '0000000000000000');
    HASH_TABLE.set('https://x/b.jpg', 'ffffffffffffffff');
    const { view, rawImagesRef } = harness([
      img('https://x/a.jpg', { width: 100, height: 100 }),
      img('https://x/b.jpg', { width: 100, height: 100 }),
    ]);

    await act(async () => {
      await view.result.current.run();
    });

    expect(rawImagesRef.current.every((i) => !i.nearDuplicate)).toBe(true);
  });

  it('survives a decode failure on one item without stalling the batch', async () => {
    HASH_TABLE.set('https://x/keep.jpg', '0000000000000000');
    HASH_TABLE.set('https://x/dupe.jpg', '0000000000000001');
    const { view, rawImagesRef } = harness([
      img('https://x/keep.jpg', { width: 2048, height: 1536 }),
      img('https://x/dupe.jpg', { width: 320, height: 240 }),
      img('https://x/broken.jpg', { width: 500, height: 500 }),
    ]);

    await act(async () => {
      await view.result.current.run();
    });

    expect(rawImagesRef.current.find((i) => i.src.endsWith('dupe.jpg'))?.nearDuplicate).toBe(true);
    expect(rawImagesRef.current.find((i) => i.src.endsWith('broken.jpg'))?.nearDuplicate).toBeFalsy();
  });

  it('marks nothing when cancelled', async () => {
    HASH_TABLE.set('https://x/a.jpg', '0000000000000000');
    HASH_TABLE.set('https://x/b.jpg', '0000000000000001');
    const { view, rawImagesRef } = harness([
      img('https://x/a.jpg', { width: 320, height: 240 }),
      img('https://x/b.jpg', { width: 2048, height: 1536 }),
    ]);

    await act(async () => {
      const p = view.result.current.run();
      view.result.current.cancel();
      await p;
    });

    expect(rawImagesRef.current.every((i) => !i.nearDuplicate)).toBe(true);
  });

  it('still marks duplicates when size-enrichment reassigns rawImagesRef with the same srcs mid-pass', async () => {
    HASH_TABLE.set('https://x/thumb.jpg', '0000000000000000');
    HASH_TABLE.set('https://x/orig.jpg', '0000000000000001');
    const images = [
      img('https://x/thumb.jpg', { width: 320, height: 240, mediaKey: 'a' }),
      img('https://x/orig.jpg', { width: 2048, height: 1536, mediaKey: 'a' }),
    ];
    const { view, rawImagesRef } = harness(images);

    let bumped = false;
    hooks.onFetch = () => {
      if (bumped) return;
      bumped = true;
      rawImagesRef.current = rawImagesRef.current!.map((i) => ({ ...i, fileSize: 4242 }));
    };

    await act(async () => {
      await view.result.current.run();
    });

    const raw = rawImagesRef.current!;
    expect(raw.find((i) => i.src.endsWith('thumb.jpg'))?.nearDuplicate).toBe(true);
    expect(raw.find((i) => i.src.endsWith('orig.jpg'))?.nearDuplicate).toBe(false);
    expect(raw.every((i) => i.fileSize === 4242)).toBe(true);
  });

  it('discards the pass (marks nothing) when a rescan swaps a src mid-pass', async () => {
    HASH_TABLE.set('https://x/thumb.jpg', '0000000000000000');
    HASH_TABLE.set('https://x/orig.jpg', '0000000000000001');
    const images = [
      img('https://x/thumb.jpg', { width: 320, height: 240 }),
      img('https://x/orig.jpg', { width: 2048, height: 1536 }),
    ];
    const { view, rawImagesRef } = harness(images);

    let bumped = false;
    hooks.onFetch = () => {
      if (bumped) return;
      bumped = true;
      rawImagesRef.current = [img('https://x/thumb.jpg'), img('https://x/RESOLVED.jpg')];
    };

    await act(async () => {
      await view.result.current.run();
    });

    expect(rawImagesRef.current!.every((i) => !i.nearDuplicate)).toBe(true);
  });

  it('does nothing with fewer than two candidates', async () => {
    HASH_TABLE.set('https://x/only.jpg', '0000000000000000');
    const { view, rawImagesRef } = harness([img('https://x/only.jpg', { width: 100, height: 100 })]);

    await act(async () => {
      await view.result.current.run();
    });

    expect(rawImagesRef.current[0].nearDuplicate).toBeFalsy();
    expect(view.result.current.running).toBe(false);
  });
});
