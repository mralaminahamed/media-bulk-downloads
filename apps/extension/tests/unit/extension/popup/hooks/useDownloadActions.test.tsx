import type { Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppState, ImageInfo, SettingsData } from '@mbd/core/types';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';
import { convertImage } from '@mbd/core/download/convert/convert';
import { sendRuntimeMessage } from '@/extension/popup/utils';
import { useDownloadActions } from '@/extension/popup/hooks/useDownloadActions';

vi.mock('@mbd/core/download/convert/convert', async () => ({
  ...(await vi.importActual<typeof import('@mbd/core/download/convert/convert')>('@mbd/core/download/convert/convert')),
  convertImage: vi.fn(),
}));

vi.mock('@/extension/popup/utils', async () => {
  const actual = await vi.importActual<typeof import('@/extension/popup/utils')>('@/extension/popup/utils');
  return { ...actual, sendRuntimeMessage: vi.fn(actual.sendRuntimeMessage) };
});

const image = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'test.jpg', alt: 'Test', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false, kind: 'image', ...over,
});

function harness(settingsPatch: Partial<SettingsData> = {}) {
  let state: AppState = { status: '', images: [], filteredImages: [], isLoading: false };
  const setState = vi.fn((updater: AppState | ((p: AppState) => AppState)) => {
    state = typeof updater === 'function' ? (updater as (p: AppState) => AppState)(state) : updater;
  });
  const setProgress = vi.fn();
  const view = renderHook(() =>
    useDownloadActions({
      settings: { ...DEFAULT_SETTINGS, ...settingsPatch },
      filteredImages: [],
      selectedSrcs: new Set<string>(),
      setState,
      setProgress,
      currentSourcePage: async () => ({ url: 'https://example.com/page' }),
    }),
  );
  return { view, getState: () => state };
}

describe('useDownloadActions — convertAndDownload send routing (audit 2026-07-15, bug #2)', () => {
  beforeEach(() => {
    (convertImage as Mock).mockReset();
    (sendRuntimeMessage as Mock).mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;
  });

  it('routes the passthrough batch and the per-item DOWNLOAD_BYTES send through sendRuntimeMessage', async () => {
    (convertImage as Mock).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), ext: 'png', mime: 'image/png' });
    const { view } = harness({ convertImagesTo: 'png' });

    const convertible = image({ src: 'https://cdn.example.com/a.jpg', type: 'jpeg' });
    const passthrough = image({ src: 'icon.svg', type: 'svg' });

    await act(async () => {
      await view.result.current.handleDownload([convertible, passthrough]);
    });

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_IMAGES', images: [passthrough] }),
    );
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_BYTES', mime: 'image/png' }),
    );
  });

  it('routes the failed-conversion fallback batch through sendRuntimeMessage', async () => {
    (convertImage as Mock).mockResolvedValue(null);
    const { view } = harness({ convertImagesTo: 'png' });
    const broken = image({ src: 'https://cdn.example.com/broken.jpg', type: 'jpeg' });

    await act(async () => {
      await view.result.current.handleDownload([broken]);
    });

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_IMAGES', images: [broken] }),
    );
  });

  it("surfaces an SSRF-blocked item as 'N blocked' in the final status instead of leaving it uncounted", async () => {
    (convertImage as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ext: 'png', mime: 'image/png' });
    const { view, getState } = harness({ convertImagesTo: 'png' });
    const blocked = image({ src: 'http://169.254.169.254/latest/meta-data/', type: 'jpeg' });

    await act(async () => {
      await view.result.current.handleDownload([blocked]);
    });

    expect(getState().status).toBe('Converted 0 images to PNG. 1 blocked.');
  });

  it('counts a blocked item separately from a converted success without double-counting', async () => {
    (convertImage as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ext: 'png', mime: 'image/png' });
    const { view, getState } = harness({ convertImagesTo: 'png' });
    const ok = image({ src: 'https://cdn.example.com/ok.jpg', type: 'jpeg' });
    const blocked = image({ src: 'http://169.254.169.254/latest/meta-data/', type: 'jpeg' });

    await act(async () => {
      await view.result.current.handleDownload([ok, blocked]);
    });

    expect(getState().status).toBe('Converted 1 image to PNG. 1 blocked.');
  });
});
