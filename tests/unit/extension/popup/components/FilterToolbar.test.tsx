import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import FilterToolbar from '@/extension/popup/components/FilterToolbar';
import { SettingsData } from '@/types';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';

describe('FilterToolbar Component', () => {
  const mockOnFilterChange = vi.fn();
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
    bubbleEnabled: false,
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
  };

  const renderToolbar = (over: Partial<SettingsData> = {}) =>
    render(<FilterToolbar onFilterChange={mockOnFilterChange} extensionSettings={{ ...settings, ...over }} />);

  const openMore = () => fireEvent.click(screen.getByRole('button', { name: /More/i }));

  beforeEach(() => mockOnFilterChange.mockClear());

  it('renders filters with a Type dropdown', () => {
    renderToolbar();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    openMore();
    const typeSelect = screen.getByLabelText('Media format');
    expect(typeSelect).toBeInTheDocument();
    expect(within(typeSelect).getByRole('option', { name: 'All formats' })).toBeInTheDocument();
    expect(within(typeSelect).getByRole('option', { name: 'JPEG' })).toBeInTheDocument();
  });

  it('applies a type filter from the More popover', () => {
    renderToolbar();
    openMore();
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'jpeg' } });
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ imageType: 'jpeg' }));
  });

  it('counts an active format in the More badge', () => {
    renderToolbar();
    openMore();
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'png' } });
    // advanced badge now reads 1 (format only)
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('keeps advanced filters behind "More"', () => {
    renderToolbar();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /base64/i })).not.toBeInTheDocument();
    openMore();
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /base64/i })).toBeInTheDocument();
  });

  it('updates the minimum size filter (in More)', () => {
    renderToolbar();
    openMore();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ minSize: 100 }));
  });

  it('toggles the base64 switch (in More)', () => {
    renderToolbar();
    openMore();
    fireEvent.click(screen.getByRole('switch', { name: /base64/i }));
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ includeBase64: false }));
  });

  it('disables the base64 switch when the setting excludes base64', () => {
    renderToolbar({ excludeBase64Images: true });
    openMore();
    expect(screen.getByRole('switch', { name: /base64/i })).toBeDisabled();
  });

  it('shows a reset control only when filters are active, and resets them', () => {
    renderToolbar();
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

    openMore();
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'png' } });
    fireEvent.click(screen.getByText('Clear all'));

    expect(mockOnFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageType: 'all', minSize: 0, includeBase64: true }),
    );
  });

  it('applies a size bucket when a size control is clicked (in More)', () => {
    renderToolbar();
    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({ sizeBucket: 'large' }));
  });

  it('includes the size bucket in a reset', () => {
    renderToolbar();
    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'Small' }));
    fireEvent.click(screen.getByText('Clear all'));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sizeBucket: 'all' }),
    );
  });

  it('filters by a free-text search query as the user types', () => {
    renderToolbar();
    fireEvent.change(screen.getByRole('searchbox', { name: /search media/i }), { target: { value: 'sunset' } });
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'sunset' }));
  });

  it('changes the sort field via the Sort dropdown', () => {
    renderToolbar();
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'size' } });
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'size' }));
  });

  it('flips sort direction, but only once a sort field is chosen', () => {
    renderToolbar();
    const dir = screen.getByRole('button', { name: /sort direction/i });
    // Nothing to order under "Sort: Default", so the direction toggle is inert.
    expect(dir).toBeDisabled();

    // Choosing a field enables the toggle; default direction is descending.
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'name' } });
    expect(dir).toBeEnabled();
    expect(dir).toHaveAccessibleName(/descending/i);

    // First click → ascending; the label and the emitted filter both flip.
    fireEvent.click(dir);
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sortDir: 'asc' }));
    expect(dir).toHaveAccessibleName(/ascending/i);

    // Second click flips back to descending.
    fireEvent.click(dir);
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sortDir: 'desc' }));
  });

  it('counts search + sort toward the active-filter Clear-all affordance', () => {
    renderToolbar();
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    // A search term alone is an active filter → Clear all appears.
    fireEvent.change(screen.getByRole('searchbox', { name: /search media/i }), { target: { value: 'cat' } });
    expect(screen.getByText('Clear all')).toBeInTheDocument();
    // Clearing resets search back to empty.
    fireEvent.click(screen.getByText('Clear all'));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', sortBy: 'default' }));
  });

  it('switches format options when the media kind changes', async () => {
    const onFilterChange = vi.fn();
    render(<FilterToolbar onFilterChange={onFilterChange} extensionSettings={DEFAULT_SETTINGS} />);
    fireEvent.click(screen.getByRole('button', { name: /More/i }));
    const typeSelect = screen.getByLabelText('Media format');
    // image formats by default
    expect(within(typeSelect).getByRole('option', { name: 'JPEG' })).toBeInTheDocument();
    // switch to Video (kind stays a segmented button)
    await userEvent.click(screen.getByRole('button', { name: 'Video' }));
    expect(within(screen.getByLabelText('Media format')).getByRole('option', { name: 'MP4' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Media format')).queryByRole('option', { name: 'JPEG' })).not.toBeInTheDocument();
    // kind change resets the format to 'all'
    expect(onFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ mediaKind: 'video', imageType: 'all' }),
    );
  });

  it('offers audio codec options when the Audio kind is selected', async () => {
    renderToolbar();
    openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Audio' }));
    const typeSelect = screen.getByLabelText('Media format');
    expect(within(typeSelect).getByRole('option', { name: 'MP3' })).toBeInTheDocument();
    expect(within(typeSelect).getByRole('option', { name: 'FLAC' })).toBeInTheDocument();
    expect(within(typeSelect).queryByRole('option', { name: 'JPEG' })).not.toBeInTheDocument();
  });

  it('coerces a cleared minimum-size field back to 0', () => {
    renderToolbar();
    openMore();
    const min = screen.getByRole('spinbutton');
    fireEvent.change(min, { target: { value: '100' } });
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ minSize: 100 }));
    // Clearing the field yields '' → parseInt('' ) is NaN → falls back to 0.
    fireEvent.change(min, { target: { value: '' } });
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ minSize: 0 }));
  });

  it('applies a downloaded filter from the State chip', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Downloaded' }));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ downloadState: 'downloaded' }));
  });

  it('clears the State filter via its × (back to all)', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Not downloaded' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove State filter' }));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ downloadState: 'all' }));
  });

  it('resets the State filter via the global "Clear all" control', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Downloaded' }));
    fireEvent.click(screen.getByText('Clear all'));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ downloadState: 'all' }));
  });

  it('surfaces an active Size filter as a removable chip and clears it via ×', () => {
    renderToolbar();
    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'Large' })); // size seg in More
    // a Size chip now appears in the primary row
    const clearSize = screen.getByRole('button', { name: 'Remove Size filter' });
    expect(clearSize).toBeInTheDocument();
    fireEvent.click(clearSize);
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sizeBucket: 'all' }));
  });

  it('surfaces an active Base64 filter as a removable chip', () => {
    renderToolbar();
    openMore();
    fireEvent.click(screen.getByRole('switch', { name: /base64/i })); // turn base64 off
    expect(screen.getByRole('button', { name: 'Remove Base64 filter' })).toBeInTheDocument();
  });

  it('surfaces an active Format filter as a removable chip with the canonical mixed-case label and clears it via ×', () => {
    renderToolbar();
    openMore();
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'webp' } });
    // canonical label from the select's options, not filters.imageType.toUpperCase()
    expect(screen.getByRole('button', { name: 'WebP' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Format filter' }));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ imageType: 'all' }));
  });

  it('surfaces an active Min size filter as a removable chip and clears it via ×', () => {
    renderToolbar();
    openMore();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '500' } });
    expect(screen.getByRole('button', { name: '≥ 500 KB' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Min size filter' }));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ minSize: 0 }));
  });
});
