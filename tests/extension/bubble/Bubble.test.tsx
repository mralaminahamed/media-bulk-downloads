import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Bubble from '@/extension/bubble/Bubble';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { SettingsData } from '@/types';

// Never-resolving deep scan so we can observe its abort signal on panel close.
jest.mock('@/extension/content/deepScanRunner', () => ({
  startDeepScan: jest.fn(() => new Promise(() => {})),
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
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
};

// jsdom leaves clientX/clientY unset on PointerEvent inits, so build the native
// event by hand and attach the coordinates React reads through the synthetic event.
const pointer = (type: string, clientX: number, clientY: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { pointerId: 1, clientX, clientY });
  return e;
};

const dispatchToggle = () => {
  (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls
    .map((c) => c[0])
    .forEach((fn) => fn('TOGGLE_BUBBLE'));
};

describe('Bubble', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
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

  it('does not move or persist on a jittery click (sub-threshold travel)', () => {
    const set = chrome.storage.sync.set as jest.Mock;
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    // A couple of px of jitter, well under DRAG_THRESHOLD (6).
    fireEvent(launcher, pointer('pointermove', 102, 101));
    fireEvent(launcher, pointer('pointerup', 102, 101));

    expect(launcher.getAttribute('style')).toBe(before);
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps the launcher fixed in place when the panel opens', async () => {
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    // Open via a plain click.
    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointerup', 100, 100));
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    // The launcher must not have reflowed — its anchor style is unchanged.
    expect(launcher.getAttribute('style')).toBe(before);
  });

  it('repositions and persists on an intentional drag', () => {
    const set = chrome.storage.sync.set as jest.Mock;
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 400, 300));
    fireEvent(launcher, pointer('pointerup', 400, 300));

    expect(launcher.getAttribute('style')).not.toBe(before);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ bubblePosition: expect.any(Object) }) }),
    );
    // A drag must not toggle the panel open.
    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('centers the panel when the placement is "center"', async () => {
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'center' }} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.transform).toBe('translate(-50%, -50%)');
    expect(panel.style.top).toBe('50%');
    expect(panel.style.left).toBe('50%');
  });

  it('drags the panel to a free point via its header and persists it', async () => {
    const set = chrome.storage.sync.set as jest.Mock;
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;

    fireEvent(header, pointer('pointerdown', 200, 30));
    fireEvent(header, pointer('pointermove', 500, 320));
    fireEvent(header, pointer('pointerup', 500, 320));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).not.toBe('');
    expect(panel.style.top).not.toBe('');
    expect(panel.style.bottom).toBe('');
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          bubblePanelPlacement: 'free',
          bubblePanelPoint: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        }),
      }),
    );
  });

  it('does not start a header drag when a header control is pressed', async () => {
    const set = chrome.storage.sync.set as jest.Mock;
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const settingsBtn = screen.getByRole('button', { name: 'Settings' });
    set.mockClear();

    // Pressing on a control must not begin a free-drag, even if the pointer moves.
    fireEvent(settingsBtn, pointer('pointerdown', 200, 30));
    fireEvent(settingsBtn, pointer('pointermove', 500, 320));
    fireEvent(settingsBtn, pointer('pointerup', 500, 320));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe(''); // still anchored (bottom/right), not free
    expect(set).not.toHaveBeenCalled();
  });

  it('resizes the panel via the corner grip and persists width/height', async () => {
    const set = chrome.storage.sync.set as jest.Mock;
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    // Default placement is anchored to the bottom-right corner, so the free
    // edges are top/left: width grows as the pointer moves left, height as it
    // moves up. 440 + (300-200) = 540, 560 + (300-200) = 660.
    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 200, 200));
    fireEvent(grip, pointer('pointerup', 200, 200));

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ bubbleWidth: 540, bubbleHeight: 660 }),
      }),
    );
  });

  it('pins the panel to a corner independent of the launcher corner', async () => {
    // Button anchored bottom-right; panel pinned top-left.
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'top-left' }} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.top).toBe('16px');
    expect(panel.style.left).toBe('16px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.right).toBe('');
  });

  it('toggles open/closed on a TOGGLE_BUBBLE message', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    expect(await screen.findByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
    dispatchToggle();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  it('closes on Escape', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  it('Escape closes an open sub-dialog, keeping the panel open', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('dialog', { name: 'Settings' });

    // Dispatch on document so both the panel's window-capture handler and the
    // sub-dialog's document handler see it (as in a real bubbling keydown).
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('aborts a running deep scan when the panel closes', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));
    const signal = (startDeepScan as jest.Mock).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    dispatchToggle(); // close the panel
    await waitFor(() => expect(signal.aborted).toBe(true));
  });

  it('dims the page behind the panel without blocking it (visual-only)', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    const scrim = document.querySelector('.ibd-bubble-scrim') as HTMLElement;
    expect(scrim).toBeInTheDocument();
    expect(scrim.style.pointerEvents).toBe('none'); // page stays interactive

    // Non-blocking: interacting where the scrim is does not close the panel.
    fireEvent.click(scrim);
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });
});
