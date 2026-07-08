import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Bubble from '@/extension/bubble/Bubble';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { SettingsData } from '@/types';

// Never-resolving deep scan so we can observe its abort signal on panel close.
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
  captureHlsStreams: false,
  excludeEmoji: false,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
};

// Persist now routes through the SET_SETTINGS message (single serialized writer
// in the background), not a direct storage.sync.set — assert the sent patches.
const settingsPatches = (): Array<Record<string, unknown>> =>
  (chrome.runtime.sendMessage as Mock).mock.calls
    .filter((c) => c[0]?.type === 'SET_SETTINGS')
    .map((c) => c[0].patch as Record<string, unknown>);

// jsdom leaves clientX/clientY unset on PointerEvent inits, so build the native
// event by hand and attach the coordinates React reads through the synthetic event.
const pointer = (type: string, clientX: number, clientY: number) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { pointerId: 1, clientX, clientY });
  return e;
};

const dispatchToggle = () => {
  (chrome.runtime.onMessage.addListener as Mock).mock.calls
    .map((c) => c[0])
    .forEach((fn) => fn('TOGGLE_BUBBLE'));
};

// The most recently registered chrome.storage.onChanged listener — i.e. the one
// the just-rendered Bubble installed on mount. Used to simulate the popup writing
// new settings, which the bubble must live-sync into its own placement/position.
const lastStorageListener = () => {
  const calls = (chrome.storage.onChanged.addListener as Mock).mock.calls;
  return calls[calls.length - 1][0] as (
    changes: { [k: string]: chrome.storage.StorageChange },
    area: string,
  ) => void;
};

describe('Bubble', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    // Clear only the call log (not the never-resolving default impl from the
    // module mock) so each test's deep-scan call is reliably mock.calls[0].
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

  it('does not move or persist on a jittery click (sub-threshold travel)', () => {
    const set = chrome.storage.sync.set as Mock;
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
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 400, 300));
    fireEvent(launcher, pointer('pointerup', 400, 300));

    expect(launcher.getAttribute('style')).not.toBe(before);
    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubblePosition: expect.any(Object) }));
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
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
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
    expect(settingsPatches()).toContainEqual(expect.objectContaining({
      bubblePanelPlacement: 'free',
      bubblePanelPoint: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    }));
  });

  // NOTE: onHeaderPointerDown's `if (!rect) return;` guard (Bubble.tsx:258) is
  // defensively unreachable — the drag handle lives inside the panel, so
  // panelRef.current is always mounted (jsdom returns a zero-size rect, never
  // null) whenever this handler fires. Left uncovered by design.
  it('does not start a header drag when a header control is pressed', async () => {
    const set = chrome.storage.sync.set as Mock;
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
    const set = chrome.storage.sync.set as Mock;
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings }));
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

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 540, bubbleHeight: 660 }));
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

  it('Escape from a focused text field does not collapse the panel (clears the field instead)', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    // Escape originating from a text input (e.g. the search box) must not close
    // the whole panel — the capture handler bails when the target is editable.
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
    input.remove();
  });

  it('aborts a running deep scan when the panel closes', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));
    const signal = (startDeepScan as Mock).mock.calls[0][1] as AbortSignal;
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

  // --- Placement styles ------------------------------------------------------

  it('anchors the panel beside the launcher (anchored placement)', async () => {
    // Default: anchored, corner bottom-right, button at {x:20, y:20}.
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    // Sits beside the button reserving its footprint: bottom = y + FAB(48) + GAP(10)
    // = 78; right = x = 20. Top/left stay unset (anchored to bottom-right).
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
      dispatchToggle();
      await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

      const panel = document.querySelector('.sheet-in') as HTMLElement;
      (Object.entries(edges) as [string, string][]).forEach(([k, v]) =>
        expect(panel.style.getPropertyValue(k)).toBe(v),
      );
      // The unpinned edges must be blank so only the corner offsets apply.
      const blanks = ['top', 'right', 'bottom', 'left'].filter((k) => !(k in edges));
      blanks.forEach((k) => expect(panel.style.getPropertyValue(k)).toBe(''));

      // The resize grip lives on the panel's free corner with a matching cursor.
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
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe('123px');
    expect(panel.style.top).toBe('77px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.right).toBe('');
  });

  // --- Launcher drag: corner math + viewport clamping ------------------------

  it('clamps a dragged launcher to the viewport (top-left corner math)', () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={{ ...settings, bubblePosition: { corner: 'top-left', x: 8, y: 8 } }} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    set.mockClear();

    // Drag far past the bottom-right edge. For a top-left corner the offset is
    // measured from the top-left: nx = clientX - FAB/2, ny = clientY - FAB/2,
    // both clamped to [EDGE, viewport - FAB - EDGE].
    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 9999, 9999));
    fireEvent(launcher, pointer('pointerup', 9999, 9999));

    const maxX = window.innerWidth - 48 - 8; // vw - FAB - EDGE
    const maxY = window.innerHeight - 48 - 8;
    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubblePosition: { corner: 'top-left', x: maxX, y: maxY } }));
    // The launcher itself is clamped (anchored via top/left for a top-left corner).
    expect(launcher.style.left).toBe(`${maxX}px`);
    expect(launcher.style.top).toBe(`${maxY}px`);
  });

  // --- Header drag: free-point clamping --------------------------------------

  it('clamps a header-dragged panel to the viewport (freePoint bounds)', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;
    set.mockClear();

    // jsdom reports a zero-size rect, so the drag origin is (0,0) with w/h = 0;
    // dragging far past the edge clamps the point to [EDGE, viewport - EDGE].
    fireEvent(header, pointer('pointerdown', 100, 100));
    fireEvent(header, pointer('pointermove', 9999, 9999));
    fireEvent(header, pointer('pointerup', 9999, 9999));

    const maxX = window.innerWidth - 8; // vw - w(0) - EDGE
    const maxY = window.innerHeight - 8;
    expect(settingsPatches()).toContainEqual(expect.objectContaining({
      bubblePanelPlacement: 'free',
      bubblePanelPoint: { x: maxX, y: maxY },
    }));
    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe(`${maxX}px`);
    expect(panel.style.top).toBe(`${maxY}px`);
  });

  // --- Resize: free-corner growth + min clamp --------------------------------

  it('resizes a centered panel from its bottom-right grip (both edges free)', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'center' }} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    // Centered → both edges free: width grows as the pointer moves right, height
    // as it moves down. 440 + (500-300) = 640; 560 + (450-300) = 710. Both stay
    // under the viewport cap (1024x768 → maxW 1008, maxH 752).
    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 500, 450));
    fireEvent(grip, pointer('pointerup', 500, 450));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 640, bubbleHeight: 710 }));
  });

  it('clamps a resize to the minimum panel size', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />); // anchored bottom-right: free edges top/left
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    // Free edges are top/left, so width shrinks as the pointer moves right and
    // height as it moves down. Overshooting drives both below MIN_W(320)/MIN_H(360),
    // where the clamp holds the floor: 440 + (300-900) < 320 → 320; 560 + (300-900) < 360 → 360.
    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 900, 900));
    fireEvent(grip, pointer('pointerup', 900, 900));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 320, bubbleHeight: 360 }));
  });

  // --- Live-sync from popup settings (storage.onChanged) ---------------------

  it('live-syncs corner/pos/size/placement/point from a popup settings change', async () => {
    render(<Bubble initialSettings={settings} />);
    const listener = lastStorageListener();
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    // Starts anchored to bottom-right (bottom set, left unset).
    let panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.bottom).not.toBe('');
    expect(panel.style.left).toBe('');

    // The popup writes new settings: pin the panel top-left and move the button.
    act(() => {
      listener(
        {
          settings: {
            oldValue: settings,
            newValue: {
              ...settings,
              bubblePosition: { corner: 'top-left', x: 30, y: 40 },
              bubbleWidth: 500,
              bubbleHeight: 600,
              bubblePanelPlacement: 'top-left',
              bubblePanelPoint: { x: 5, y: 5 },
            },
          } as chrome.storage.StorageChange,
        },
        'sync',
      );
    });

    // Panel re-styles to the pinned top-left corner…
    panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.top).toBe('16px');
    expect(panel.style.left).toBe('16px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.right).toBe('');
    // …and the launcher re-anchors to the new corner/offset.
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    expect(launcher.style.top).toBe('40px');
    expect(launcher.style.left).toBe('30px');
  });

  it('ignores storage changes from another area or without settings', () => {
    render(<Bubble initialSettings={settings} />);
    const listener = lastStorageListener();
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    const before = launcher.getAttribute('style');

    act(() => {
      // Wrong area — must be ignored even though `settings` changed.
      listener(
        { settings: { newValue: { ...settings, bubblePosition: { corner: 'top-left', x: 1, y: 1 } } } } as {
          [k: string]: chrome.storage.StorageChange;
        },
        'local',
      );
      // Right area, but no `settings` key — nothing to sync.
      listener({ other: { newValue: 1 } } as { [k: string]: chrome.storage.StorageChange }, 'sync');
    });

    expect(launcher.getAttribute('style')).toBe(before);
  });

  // --- Deep scan progress + abort wiring -------------------------------------

  it('streams deep-scan progress and surfaces the stop reason', async () => {
    // Report progress twice — once without a reason, once with a cap reason — so
    // the bubble's progress wrapper forwards both shapes to the panel.
    (startDeepScan as Mock).mockImplementationOnce((onProgress) => {
      onProgress(3, 1, 100); // no reason
      onProgress(7, 2, 200, 'max-items'); // capped
      return Promise.resolve([]);
    });
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));

    // The cap reason bubbles up into a user-facing status line.
    expect(await screen.findByText(/Stopped at the .*item limit/i)).toBeInTheDocument();
  });

  it('aborts an in-flight deep scan when the Stop button is pressed', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));
    const signal = (startDeepScan as Mock).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    // Pressing the (now) Stop control routes through abortDeepScan → the bubble's
    // abort ref, tearing down the in-page scan without closing the panel.
    fireEvent.click(await screen.findByRole('button', { name: 'Stop deep scan' }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  // --- Header Close control --------------------------------------------------

  it('closes the panel via the header Close button', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  // --- More resize placements (maxPanelSize reserve branches) -----------------

  it('resizes a free-placed panel from its bottom-right grip', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(
      <Bubble
        initialSettings={{ ...settings, bubblePanelPlacement: 'free', bubblePanelPoint: { x: 100, y: 100 } }}
      />,
    );
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    // Free placement reserves only the edge inset, so both edges grow toward the
    // pointer: 440 + (520-300) = 660; 560 + (440-300) = 700 (both under the cap).
    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 520, 440));
    fireEvent(grip, pointer('pointerup', 520, 440));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 660, bubbleHeight: 700 }));
  });

  it('resizes a corner-pinned panel toward its free edges', async () => {
    const set = chrome.storage.sync.set as Mock;
    // Pinned top-left → free edges are right/bottom; reserves PANEL_MARGIN.
    render(<Bubble initialSettings={{ ...settings, bubblePanelPlacement: 'top-left' }} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const grip = screen.getByRole('button', { name: 'Resize panel' });
    set.mockClear();

    // 440 + (400-300) = 540; 560 + (380-300) = 640 (both under the corner cap).
    fireEvent(grip, pointer('pointerdown', 300, 300));
    fireEvent(grip, pointer('pointermove', 400, 380));
    fireEvent(grip, pointer('pointerup', 400, 380));

    expect(settingsPatches()).toContainEqual(expect.objectContaining({ bubbleWidth: 540, bubbleHeight: 640 }));
  });

  // --- Defensive guards: stray pointer events with no active gesture ----------

  it('ignores launcher pointer move/up when no drag is in progress', () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Media Bulk Downloads' });
    set.mockClear();

    // No preceding pointerdown → both handlers must bail out.
    fireEvent(launcher, pointer('pointermove', 50, 50));
    fireEvent(launcher, pointer('pointerup', 50, 50));

    expect(set).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('ignores resize grip move/up when no resize is in progress', async () => {
    const set = chrome.storage.sync.set as Mock;
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
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
    dispatchToggle();
    const heading = await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    const header = heading.closest('header') as HTMLElement;
    set.mockClear();

    // A real press on the header, but travel stays under DRAG_THRESHOLD (6px).
    fireEvent(header, pointer('pointerdown', 200, 30));
    fireEvent(header, pointer('pointermove', 202, 31));
    fireEvent(header, pointer('pointerup', 203, 31));

    const panel = document.querySelector('.sheet-in') as HTMLElement;
    expect(panel.style.left).toBe(''); // still anchored, never switched to free
    expect(set).not.toHaveBeenCalled();
  });

  it('leaves the open panel untouched on a non-Escape key', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading', { name: 'Media Bulk Downloads' })).toBeInTheDocument();
  });

  it('ignores runtime messages other than TOGGLE_BUBBLE', () => {
    render(<Bubble initialSettings={settings} />);
    const calls = (chrome.runtime.onMessage.addListener as Mock).mock.calls;
    const listener = calls[calls.length - 1][0] as (m: unknown) => void;

    act(() => listener('SOME_OTHER_MESSAGE'));

    expect(screen.queryByRole('heading', { name: 'Media Bulk Downloads' })).not.toBeInTheDocument();
  });
});
