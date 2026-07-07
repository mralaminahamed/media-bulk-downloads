import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './../../../../src/extension/popup/components/Settings';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { SettingsData } from '@/types';

describe('Settings Component', () => {
  const mockOnClose = jest.fn();
  const mockOnSettingsChange = jest.fn();
  const initialSettings: SettingsData = {
    downloadPath: 'downloads',
    fileNamePrefix: 'image_',
    popupWidth: 400,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
    saveAs: false,
    notifyOnComplete: false,
    convertImagesTo: 'off',
    namingMode: 'prefixed' as const,
    thumbnailSize: 120,
    previewSize: 360,
    bubbleEnabled: false,
    bubblePosition: { corner: 'bottom-right' as const, x: 20, y: 20 },
    bubbleWidth: 440,
    bubbleHeight: 560,
    bubblePanelPlacement: 'anchored' as const,
    bubblePanelPoint: { x: 40, y: 40 },
    resolveOriginals: false,
    captureHlsStreams: false,
    excludeEmoji: false,
    deepScanMaxItems: 1000,
    deepScanMaxSeconds: 20,
    deepScanMaxScrolls: 40,
    deepScanClickLoadMore: false,
  };

  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnSettingsChange.mockClear();
  });

  it('renders correctly with initial settings', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    expect(screen.getByLabelText(/Save to subfolder \(in Downloads\):/)).toHaveValue('downloads');
    expect(screen.getByLabelText(/File name prefix:/)).toHaveValue('image_');
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onSettingsChange with updated settings when save is clicked', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    fireEvent.change(screen.getByLabelText(/Save to subfolder \(in Downloads\):/), { target: { value: 'new_path' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      downloadPath: 'new_path',
    }));
  });

  it('toggles switch settings correctly', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    const toggle = screen.getByRole('switch', { name: /show image count/i });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      showImageCount: false,
    }));
  });

  it('toggles exclude emoji', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    fireEvent.click(screen.getByRole('switch', { name: /exclude emoji/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      excludeEmoji: true,
    }));
  });

  it('saves number fields as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    fireEvent.change(screen.getByLabelText('Minimum Image Size (px):'), { target: { value: '128' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ minimumImageSize: 128 }));
  });

  it('saves the thumbnail and preview sizes as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    fireEvent.change(screen.getByLabelText('Thumbnail Size (px):'), { target: { value: '96' } });
    fireEvent.change(screen.getByLabelText('Preview Size (px):'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailSize: 96, previewSize: 500 }),
    );
  });

  it('reveals the corner selector only after enabling the bubble', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    expect(screen.queryByLabelText('Bubble Corner:')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    const corner = screen.getByLabelText('Bubble Corner:');
    fireEvent.change(corner, { target: { value: 'top-left' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bubbleEnabled: true,
        bubblePosition: expect.objectContaining({ corner: 'top-left' }),
      }),
    );
  });

  it('saves the chosen panel placement', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    fireEvent.change(screen.getByLabelText('Panel Position:'), { target: { value: 'center' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ bubblePanelPlacement: 'center' }),
    );
  });

  it('saves the bubble width and height as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    fireEvent.change(screen.getByLabelText('Bubble Width:'), { target: { value: '520' } });
    fireEvent.change(screen.getByLabelText('Bubble Height:'), { target: { value: '600' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ bubbleWidth: 520, bubbleHeight: 600 }),
    );
  });

  it('saves the save-as toggle', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.click(screen.getByRole('switch', { name: /ask where to save/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ saveAs: true }));
  });

  it('saves the chosen naming mode', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ namingMode: 'original' }));
  });

  it('toggles resolveOriginals', async () => {
    const onSettingsChange = jest.fn();
    render(<Settings settings={{ ...DEFAULT_SETTINGS }} onClose={() => {}} onSettingsChange={onSettingsChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /resolve exact originals/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ resolveOriginals: true }));
  });

  it('previews the Downloads subfolder path', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={{ ...initialSettings, downloadPath: 'Pics/Cats' }} />);
    expect(screen.getByText('Downloads/Pics/Cats/image.jpg')).toBeInTheDocument();
  });

  it('hides the file name prefix field in Original naming mode', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    expect(screen.getByLabelText(/File name prefix:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(screen.queryByLabelText(/File name prefix:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prefixed' }));
    expect(screen.getByLabelText(/File name prefix:/)).toBeInTheDocument();
  });

  it('disables Save until something changes', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Save to subfolder \(in Downloads\):/), { target: { value: 'x' } });
    expect(save).toBeEnabled();
  });

  it('closes on the Escape key', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('clamps an out-of-range number field to its max on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    const thumb = screen.getByLabelText('Thumbnail Size (px):');
    fireEvent.change(thumb, { target: { value: '9999' } });
    fireEvent.blur(thumb);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ thumbnailSize: 240 }));
  });

  it('clamps the minimum image size to its cap on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    const min = screen.getByLabelText('Minimum Image Size (px):');
    fireEvent.change(min, { target: { value: '999999' } });
    fireEvent.blur(min);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ minimumImageSize: 10000 }));
  });

  it('exposes the sheet as a labelled modal dialog', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true');
  });
});