import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Bubble from '@/extension/bubble/Bubble';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { SettingsData } from '@mbd/core/types';

vi.mock('@/extension/content/deepScanRunner', () => ({
  startDeepScan: vi.fn(() => new Promise(() => {})),
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
  sankakuAuthedOriginals: false,
  fetchImages: true, fetchVideo: true, fetchAudio: true,
  captureHlsStreams: false, streamQuality: 'auto', audioFormat: 'm4a', metadataSidecar: false, nearDuplicateThreshold: 8,
  downloadConcurrency: 5,
  excludeEmoji: false,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
  smartPageDefaults: false,
  rememberScanBehaviour: true,
  skipDuplicateDownloads: true,
};

const settingsPatches = (): Array<Record<string, unknown>> =>
  (chrome.runtime.sendMessage as Mock).mock.calls
    .filter((c) => c[0]?.type === 'SET_SETTINGS')
    .map((c) => c[0].patch as Record<string, unknown>);

const pointer = (type: string, clientX: number, clientY: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { pointerId: 1, clientX, clientY });
  return e;
};

const dispatchToggle = async () => {
  await act(async () => {
    (chrome.runtime.onMessage.addListener as Mock).mock.calls
      .map((c) => c[0])
      .forEach((fn) => fn('TOGGLE_BUBBLE'));
  });
};

const dispatchSettingsChange = async (settings: SettingsData) => {
  await act(async () => {
    (chrome.runtime.onMessage.addListener as Mock).mock.calls
      .map((c) => c[0])
      .forEach((fn) => fn({ type: 'SETTINGS_CHANGED', settings }));
  });
};

describe('Bubble', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    (startDeepScan as Mock).mockClear();
    document.body.innerHTML = '';
  });

  it('renders the launcher with the panel closed', () => {
    render(<Bubble initialSettings={settings} />);
    expect(screen.getByRole('button', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('opens the panel on a click (pointer down/up without dragging)', async () => {
    render(<Bubble initialSettings={settings} />);
    const fab = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    fireEvent.pointerDown(fab, { pointerId: 1 });
    fireEvent.pointerUp(fab, { pointerId: 1 });
    expect(await screen.findByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('does not move or persist on a jittery click (sub-threshold travel)', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 102, 101));
    fireEvent(launcher, pointer('pointerup', 102, 101));

    expect(launcher.getAttribute('style')).toBe(before);
    expect(set).not.toHaveBeenCalled();
    await screen.findByText(/on this page/i);
  });

  it('keeps the launcher fixed in place when the panel opens', async () => {
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointerup', 100, 100));
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    expect(launcher.getAttribute('style')).toBe(before);
  });

  it('repositions and persists on an intentional drag', () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 400, 300));
    fireEvent(launcher, pointer('pointerup', 400, 300));

    expect(launcher.getAttribute('style')).not.toBe(before);
    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubblePosition: expect.any(Object) }));
    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('resets grabbing and persists position on a pointercancel mid-drag', () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 400, 300));
    expect(launcher.style.cursor).toBe('grabbing');

    fireEvent(launcher, pointer('pointercancel', 400, 300));

    expect(launcher.style.cursor).toBe('pointer');
    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubblePosition: expect.any(Object) }));
  });

  it('centers the panel when the placement is "center"', async () => {
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'center' }} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.transform).toBe('translate(-50%, -50%)');
    expect(panel.style.top).toBe('50%');
    expect(panel.style.left).toBe('50%');
  });

  it('drags the panel to a free point via its header and persists it', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;

    fireEvent(header, pointer('pointerdown', 200, 30));
    fireEvent(header, pointer('pointermove', 500, 320));
    fireEvent(header, pointer('pointerup', 500, 320));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).not.toBe('');
    expect(panel.style.top).not.toBe('');
    expect(panel.style.bottom).toBe('');
    expect(settingsPatches()).toContainEqual(expect.objectContaining({
      bubblePanelPlacement: 'free',
      bubblePanelPoint: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    }));
  });

  it('persists the free placement on a pointercancel mid-header-drag', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;

    fireEvent(header, pointer('pointerdown', 200, 30));
    fireEvent(header, pointer('pointermove', 500, 320));
    fireEvent(header, pointer('pointercancel', 500, 320));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).not.toBe('');
    expect(settingsPatches()).toContainEqual(expect.objectContaining({
      bubblePanelPlacement: 'free',
      bubblePanelPoint: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    }));
  });

  it('does not start a header drag when a header control is pressed', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const settingsBtn = screen.getByRole('button', { name: 'Settings' });
    set.mockClear();

    fireEvent(settingsBtn, pointer('pointerdown', 200, 30));
    fireEvent(settingsBtn, pointer('pointermove', 500, 320));
    fireEvent(settingsBtn, pointer('pointerup', 500, 320));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe('');
    expect(set).not.toHaveBeenCalled();
  });

  it('resizes the panel via the corner grip and persists width/height', async () => {
    const set = chrome.storage.sync.set as Mock;
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 200, 200));
    fireEvent(grip, pointer('pointerup', 200, 200));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 540, bubbleHeight: 660 }));
  });

  it('pins the panel to a corner independent of the launcher corner', async () => {
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'top-left' }} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.top).toBe('16px');
    expect(panel.style.left).toBe('16px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.right).toBe('');
  });

  it('toggles open/closed on a TOGGLE_BUBBLE message', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    expect(await screen.findByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
    await dispatchToggle();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  it('closes on Escape', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  it('Escape closes an open sub-dialog, keeping the panel open', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('dialog', { name: 'Settings' });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('Escape while a text field is focused does not collapse the panel, even when the event retargets away from it', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
    input.remove();
  });

  it('aborts a running deep scan when the panel closes', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));
    await waitFor(() => expect(startDeepScan as Mock).toHaveBeenCalled());
    const signal = (startDeepScan as Mock).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    await dispatchToggle();
    await waitFor(() => expect(signal.aborted).toBe(true));
  });

  it('dims the page behind the panel without blocking it (visual-only)', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    const scrim = document.querySelector('.mbd-bubble-scrim') as HTMLElement;
    expect(scrim).toBeInTheDocument();
    expect(scrim.style.pointerEvents).toBe('none');

    fireEvent.click(scrim);
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('anchors the panel beside the launcher (anchored placement)', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.bottom).toBe('78px');
    expect(panel.style.right).toBe('20px');
    expect(panel.style.top).toBe('');
    expect(panel.style.left).toBe('');
  });

  it.each([
    ['top-right', { top: '16px', right: '16px' }, 'nesw-resize', { left: '1px', bottom: '1px' }],
    ['bottom-left', { bottom: '16px', left: '16px' }, 'nesw-resize', { right: '1px', top: '1px' }],
    ['bottom-right', { bottom: '16px', right: '16px' }, 'nwse-resize', { left: '1px', top: '1px' }],
  ] as const)(
    'pins the panel to the %s corner with the grip on its free corner',
    async (placement, edges, cursor, grip) => {
      render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: placement }} />);
      await dispatchToggle();
      await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

      const panel = document.querySelector('.sheet-in') as HTMLElement;
      (Object.entries(edges) as [string, string][]).forEach(([k, v]) =>
        expect(panel.style.getPropertyValue(k)).toBe(v),
      );
      const blanks = ['top', 'right', 'bottom', 'left'].filter((k) => !(k in edges));
      blanks.forEach((k) => expect(panel.style.getPropertyValue(k)).toBe(''));

      const gripEl = screen.getByRole('button', { name: 'Resize panel' });
      expect(gripEl.style.cursor).toBe(cursor);
      (Object.entries(grip) as [string, string][]).forEach(([k, v]) =>
        expect(gripEl.style.getPropertyValue(k)).toBe(v),
      );
    },
  );

  it('places the panel at a free point (free placement)', async () => {
    render(
      <Bubble
        initialSettings={{ ...settings, bubblePanelPlacement: 'free', bubblePanelPoint: { x: 123, y: 77 } }}
      />,
    );
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe('123px');
    expect(panel.style.top).toBe('77px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.right).toBe('');
  });

  it('clamps a dragged launcher to the viewport (top-left corner math)', () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={{ ...settings, bubblePosition: { corner: 'top-left', x: 8, y: 8 } }} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    set.mockClear();

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 9999, 9999));
    fireEvent(launcher, pointer('pointerup', 9999, 9999));

    const maxX = window.innerWidth - 48 - 8;
    const maxY = window.innerHeight - 48 - 8;
    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubblePosition: { corner: 'top-left', x: maxX, y: maxY } }));
    expect(launcher.style.left).toBe(`${maxX}px`);
    expect(launcher.style.top).toBe(`${maxY}px`);
  });

  it('clamps a header-dragged panel to the viewport (freePoint bounds)', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;
    set.mockClear();

    fireEvent(header, pointer('pointerdown', 100, 100));
    fireEvent(header, pointer('pointermove', 9999, 9999));
    fireEvent(header, pointer('pointerup', 9999, 9999));

    const maxX = window.innerWidth - 8;
    const maxY = window.innerHeight - 8;
    expect(settingsPatches()).toContainEqual(expect.objectContaining({
      bubblePanelPlacement: 'free',
      bubblePanelPoint: { x: maxX, y: maxY },
    }));
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe(`${maxX}px`);
    expect(panel.style.top).toBe(`${maxY}px`);
  });

  it('resizes a centered panel from its bottom-right grip (both edges free)', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'center' }} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 500, 450));
    fireEvent(grip, pointer('pointerup', 500, 450));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 640, bubbleHeight: 710 }));
  });

  it('clamps a resize to the minimum panel size', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 900, 900));
    fireEvent(grip, pointer('pointerup', 900, 900));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 320, bubbleHeight: 360 }));
  });

  it('live-syncs corner/pos/size/placement/point from a popup settings change', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    let panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.bottom).not.toBe('');
    expect(panel.style.left).toBe('');

    await dispatchSettingsChange({
      ...settings,
      bubblePosition: { corner: 'top-left', x: 30, y: 40 },
      bubbleWidth: 500,
      bubbleHeight: 600,
      bubblePanelPlacement: 'top-left',
      bubblePanelPoint: { x: 5, y: 5 },
    });

    panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.top).toBe('16px');
    expect(panel.style.left).toBe('16px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.right).toBe('');
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    expect(launcher.style.top).toBe('40px');
    expect(launcher.style.left).toBe('30px');
  });

  it('ignores runtime messages that are not SETTINGS_CHANGED', async () => {
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    await act(async () => {
      (chrome.runtime.onMessage.addListener as Mock).mock.calls
        .map((c) => c[0])
        .forEach((fn) => {
          fn('GET_IMAGES');
          fn({ type: 'NOT_SETTINGS', settings: { ...settings, bubblePosition: { corner: 'top-left', x: 1, y: 1 } } });
        });
    });

    expect(launcher.getAttribute('style')).toBe(before);
  });

  it('streams deep-scan progress and surfaces the stop reason', async () => {
    (startDeepScan as Mock).mockImplementationOnce((onProgress) => {
      onProgress(3, 1, 100);
      onProgress(7, 2, 200, 'max-items');
      return Promise.resolve([]);
    });
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));

    expect(await screen.findByText(/Stopped at the .*item limit/i)).toBeInTheDocument();
  });

  it('aborts an in-flight deep scan when the Stop button is pressed', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));
    await waitFor(() => expect(startDeepScan as Mock).toHaveBeenCalled());
    const signal = (startDeepScan as Mock).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Stop deep scan' }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('closes the panel via the header Close button', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  it('resizes a free-placed panel from its bottom-right grip', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(
      <Bubble
        initialSettings={{ ...settings, bubblePanelPlacement: 'free', bubblePanelPoint: { x: 100, y: 100 } }}
      />,
    );
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 520, 440));
    fireEvent(grip, pointer('pointerup', 520, 440));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 660, bubbleHeight: 700 }));
  });

  it('resizes a corner-pinned panel toward its free edges', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'top-left' }} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 400, 380));
    fireEvent(grip, pointer('pointerup', 400, 380));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 540, bubbleHeight: 640 }));
  });

  it('ignores launcher pointer move/up when no drag is in progress', () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    set.mockClear();

    fireEvent(launcher, pointer('pointermove', 50, 50));
    fireEvent(launcher, pointer('pointerup', 50, 50));

    expect(set).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('ignores resize grip move/up when no resize is in progress', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    fireEvent(grip, pointer('pointermove', 100, 100));
    fireEvent(grip, pointer('pointerup', 100, 100));

    expect(set).not.toHaveBeenCalled();
  });

  it('does not free-place the panel on a sub-threshold header nudge', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;
    set.mockClear();

    fireEvent(header, pointer('pointerdown', 200, 30));
    fireEvent(header, pointer('pointermove', 202, 31));
    fireEvent(header, pointer('pointerup', 203, 31));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe('');
    expect(set).not.toHaveBeenCalled();
  });

  it('leaves the open panel untouched on a non-Escape key', async () => {
    render(<Bubble initialSettings={settings} />);
    await dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('ignores runtime messages other than TOGGLE_BUBBLE', async () => {
    render(<Bubble initialSettings={settings} />);
    const calls = (chrome.runtime.onMessage.addListener as Mock).mock.calls;
    const listener = calls[calls.length - 1][0] as (m: unknown) => void;

    await act(async () => listener('SOME_OTHER_MESSAGE'));

    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });
});
