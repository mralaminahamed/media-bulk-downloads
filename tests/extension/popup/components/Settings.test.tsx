import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Settings from './../../../../src/extension/popup/components/Settings';

describe('Settings Component', () => {
  const mockOnClose = jest.fn();
  const mockOnSettingsChange = jest.fn();
  const initialSettings = {
    downloadPath: 'downloads',
    fileNamePrefix: 'image_',
    popupWidth: 400,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
    bubbleEnabled: false,
    bubblePosition: { corner: 'bottom-right' as const, x: 20, y: 20 },
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
    expect(screen.getByLabelText('Download Path:')).toHaveValue('downloads');
    expect(screen.getByLabelText('File Name Prefix:')).toHaveValue('image_');
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
    fireEvent.change(screen.getByLabelText('Download Path:'), { target: { value: 'new_path' } });
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

  it('saves number fields as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    fireEvent.change(screen.getByLabelText('Minimum Image Size (px):'), { target: { value: '128' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ minimumImageSize: 128 }));
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
});