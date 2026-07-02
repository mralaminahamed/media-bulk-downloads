import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterToolbar from '@/extension/popup/components/FilterToolbar';
import { SettingsData } from '@/types';

describe('FilterToolbar Component', () => {
  const mockOnFilterChange = jest.fn();
  const settings: SettingsData = {
    downloadPath: '',
    fileNamePrefix: 'image_',
    popupWidth: 460,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
    thumbnailSize: 120,
    previewSize: 360,
    bubbleEnabled: false,
    bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
    bubbleWidth: 440,
    bubbleHeight: 560,
    bubblePanelPlacement: 'anchored',
    bubblePanelPoint: { x: 40, y: 40 },
  };

  const renderToolbar = (over: Partial<SettingsData> = {}) =>
    render(<FilterToolbar onFilterChange={mockOnFilterChange} extensionSettings={{ ...settings, ...over }} />);

  beforeEach(() => mockOnFilterChange.mockClear());

  it('renders the filter section with type pills', () => {
    renderToolbar();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JPEG' })).toBeInTheDocument();
  });

  it('applies a type filter when a pill is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'JPEG' }));
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ imageType: 'jpeg' }));
  });

  it('updates the minimum size filter', () => {
    renderToolbar();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ minSize: 100 }));
  });

  it('toggles the base64 switch', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('switch', { name: /base64/i }));
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ includeBase64: false }));
  });

  it('disables the base64 switch when the setting excludes base64', () => {
    renderToolbar({ excludeBase64Images: true });
    expect(screen.getByRole('switch', { name: /base64/i })).toBeDisabled();
  });

  it('shows a reset control only when filters are active, and resets them', () => {
    renderToolbar();
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'PNG' }));
    fireEvent.click(screen.getByText('Clear all'));

    expect(mockOnFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageType: 'all', minSize: 0, includeBase64: true }),
    );
  });

  it('applies a size bucket when a size pill is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ sizeBucket: 'large' }));
  });

  it('includes the size bucket in a reset', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Small' }));
    fireEvent.click(screen.getByText('Clear all'));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sizeBucket: 'all' }),
    );
  });
});
