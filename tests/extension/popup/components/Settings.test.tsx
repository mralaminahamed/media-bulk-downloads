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

  it('toggles checkbox settings correctly', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    const checkbox = screen.getByLabelText('Show Image Count in Popup Icon');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      showImageCount: false,
    }));
  });
});