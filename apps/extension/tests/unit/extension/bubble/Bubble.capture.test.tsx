/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/profile.php?id=100000000000000&sk=photos" }
 *
 * Bubble.tsx gates `captureOriginals`/`abortCaptureOriginals` on
 * `isFbPhotoGrid(location.href)` before passing them to the embedded <App> (it
 * calls `startOriginalCapture` directly, the same in-page pattern already used
 * for deep scan via `startDeepScan`). jsdom's `location` is immutable at
 * runtime (LegacyUnforgeable), so it has to be pinned per file via
 * `@vitest-environment-options` — this file proves the "on a FB photo grid"
 * half of that gate. The "off a grid" half lives in the sibling
 * Bubble.test.tsx, which stays at jsdom's default (non-facebook) location.
 * Same technique as facebook.test.ts / facebook-offhost.test.ts.
 */
import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Bubble from '@/extension/bubble/Bubble';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { startOriginalCapture } from '@/extension/content/originalCaptureRunner';
import { isFbPhotoGrid } from '@/extension/shared/active-tab/fb-grid-url';
import { SettingsData } from '@mbd/core/types';

// Never-resolving so the tests can observe the call/signal without depending on
// the runner's real scroll/capture behavior — mirrors Bubble.test.tsx's own
// never-resolving `startDeepScan` mock.
vi.mock('@/extension/content/deepScanRunner', () => ({
  startDeepScan: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/extension/content/originalCaptureRunner', () => ({
  startOriginalCapture: vi.fn(() => new Promise(() => {})),
}));

const settings: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 460,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
  saveAs: false,
  notifyOnComplete: false,
  convertImagesTo: 'off',
  convertMetadata: 'preserve',
  namingMode: 'prefixed',
  thumbnailSize: 120,
  previewSize: 360,
  bubbleEnabled: true,
  bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
  bubbleWidth: 440,
  bubbleHeight: 560,
  bubblePanelPlacement: 'anchored',
  bubblePanelPoint: { x: 40, y: 40 },
  resolveOriginals: false,
  captureHlsStreams: false,
  downloadConcurrency: 5,
  excludeEmoji: false,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
  fbCaptureOriginals: true,
  fbCaptureMaxPhotos: 60,
  fbCaptureMaxSeconds: 180,
  streamQuality: 'auto',
  smartPageDefaults: false,
  rememberScanBehaviour: true,
  skipDuplicateDownloads: true,
  metadataSidecar: false,
};

// Delivering the TOGGLE_BUBBLE runtime message drives Bubble's setOpen (mirrors
// Bubble.test.tsx's helper of the same name).
const dispatchToggle = async () => {
  await act(async () => {
    (chrome.runtime.onMessage.addListener as Mock).mock.calls
      .map((c) => c[0])
      .forEach((fn) => fn('TOGGLE_BUBBLE'));
  });
};

describe('Bubble — original-capture wiring on a FB photo grid', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    (startDeepScan as Mock).mockClear();
    (startOriginalCapture as Mock).mockClear();
    document.body.innerHTML = '';
  });

  it('sanity-checks the pinned location is recognised as a FB photo grid', () => {
    expect(isFbPhotoGrid(location.href)).toBe(true);
  });

  it('wires captureOriginals into the embedded App, surfacing the capture button', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    expect(
      await screen.findByRole('button', { name: 'Fetch full-res originals (Facebook)' }),
    ).toBeInTheDocument();
  });

  it('calls startOriginalCapture with the configured caps when capture is confirmed', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    // The capture button opens an inline confirm dialog (Facebook original
    // capture is rate-limit-prone); only "Continue" actually starts the run.
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch full-res originals (Facebook)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(startOriginalCapture).toHaveBeenCalledTimes(1));
    expect(startOriginalCapture).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(AbortSignal),
      { maxPhotos: settings.fbCaptureMaxPhotos, maxMs: settings.fbCaptureMaxSeconds * 1000 },
    );
  });

  it('aborts an in-flight capture when the Stop control is pressed', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(await screen.findByRole('button', { name: 'Fetch full-res originals (Facebook)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(startOriginalCapture).toHaveBeenCalledTimes(1));

    const signal = (startOriginalCapture as Mock).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Stop capturing originals' }));
    expect(signal.aborted).toBe(true);
  });

  it('aborts an in-flight capture when the panel closes', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(await screen.findByRole('button', { name: 'Fetch full-res originals (Facebook)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(startOriginalCapture).toHaveBeenCalledTimes(1));

    const signal = (startOriginalCapture as Mock).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    await dispatchToggle(); // close the panel
    await waitFor(() => expect(signal.aborted).toBe(true));
  });
});
