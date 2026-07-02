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
