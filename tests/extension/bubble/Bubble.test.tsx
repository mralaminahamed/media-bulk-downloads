import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Bubble from '@/extension/bubble/Bubble';
import { SettingsData } from '@/types';

const settings: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 460,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
  bubbleEnabled: true,
  bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
  bubbleWidth: 440,
  bubbleHeight: 560,
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
    expect(screen.getByRole('button', { name: 'Image Bulk Downloads' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Image Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('opens the panel on a click (pointer down/up without dragging)', async () => {
    render(<Bubble initialSettings={settings} />);
    const fab = screen.getByRole('button', { name: 'Image Bulk Downloads' });
    fireEvent.pointerDown(fab, { pointerId: 1 });
    fireEvent.pointerUp(fab, { pointerId: 1 });
    expect(await screen.findByRole('heading', { name: 'Image Bulk Downloads' })).toBeInTheDocument();
  });

  it('does not move or persist on a jittery click (sub-threshold travel)', () => {
    const set = chrome.storage.sync.set as jest.Mock;
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Image Bulk Downloads' });
    const before = launcher.parentElement?.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    // A couple of px of jitter, well under DRAG_THRESHOLD (6).
    fireEvent(launcher, pointer('pointermove', 102, 101));
    fireEvent(launcher, pointer('pointerup', 102, 101));

    expect(launcher.parentElement?.getAttribute('style')).toBe(before);
    expect(set).not.toHaveBeenCalled();
  });

  it('repositions and persists on an intentional drag', () => {
    const set = chrome.storage.sync.set as jest.Mock;
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings }));
    render(<Bubble initialSettings={settings} />);
    const launcher = screen.getByRole('button', { name: 'Image Bulk Downloads' });
    const before = launcher.parentElement?.getAttribute('style');

    fireEvent(launcher, pointer('pointerdown', 100, 100));
    fireEvent(launcher, pointer('pointermove', 400, 300));
    fireEvent(launcher, pointer('pointerup', 400, 300));

    expect(launcher.parentElement?.getAttribute('style')).not.toBe(before);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ bubblePosition: expect.any(Object) }) }),
    );
    // A drag must not toggle the panel open.
    expect(screen.queryByRole('heading', { name: 'Image Bulk Downloads' })).not.toBeInTheDocument();
  });

  it('toggles open/closed on a TOGGLE_BUBBLE message', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    expect(await screen.findByRole('heading', { name: 'Image Bulk Downloads' })).toBeInTheDocument();
    dispatchToggle();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Image Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });

  it('closes on Escape', async () => {
    render(<Bubble initialSettings={settings} />);
    dispatchToggle();
    await screen.findByRole('heading', { name: 'Image Bulk Downloads' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Image Bulk Downloads' })).not.toBeInTheDocument(),
    );
  });
});
