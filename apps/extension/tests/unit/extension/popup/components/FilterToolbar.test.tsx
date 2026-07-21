import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import FilterToolbar from '@/extension/popup/components/FilterToolbar';
import { AvailableOptions, SettingsData } from '@mbd/core/types';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';

const allAvailable: AvailableOptions = {
  kinds: ['all', 'image', 'video'],
  formats: { image: ['all', 'png', 'avif'], video: ['all', 'mp4'], audio: ['all'] },
  sizeBuckets: ['all', 'small', 'medium', 'large'],
};

const fullAvailable: AvailableOptions = {
  kinds: ['all', 'image', 'video', 'audio'],
  formats: {
    image: ['all', 'jpeg', 'png', 'gif', 'svg', 'webp'],
    video: ['all', 'mp4', 'webm', 'ogg', 'mov'],
    audio: ['all', 'mp3', 'wav', 'ogg', 'm4a', 'flac'],
  },
  sizeBuckets: ['all', 'small', 'medium', 'large'],
};

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
    sankakuAuthedOriginals: false,
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

  const renderToolbar = (over: Partial<SettingsData> = {}) =>
    render(<FilterToolbar onFilterChange={mockOnFilterChange} extensionSettings={{ ...settings, ...over }} available={fullAvailable} />);

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
    expect(dir).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'name' } });
    expect(dir).toBeEnabled();
    expect(dir).toHaveAccessibleName(/descending/i);

    fireEvent.click(dir);
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sortDir: 'asc' }));
    expect(dir).toHaveAccessibleName(/ascending/i);

    fireEvent.click(dir);
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sortDir: 'desc' }));
  });

  it('counts search + sort toward the active-filter Clear-all affordance', () => {
    renderToolbar();
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: /search media/i }), { target: { value: 'cat' } });
    expect(screen.getByText('Clear all')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear all'));
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', sortBy: 'default' }));
  });

  it('switches format options when the media kind changes', async () => {
    const onFilterChange = vi.fn();
    render(<FilterToolbar onFilterChange={onFilterChange} extensionSettings={DEFAULT_SETTINGS} available={fullAvailable} />);
    fireEvent.click(screen.getByRole('button', { name: /More/i }));
    const typeSelect = screen.getByLabelText('Media format');
    expect(within(typeSelect).getByRole('option', { name: 'JPEG' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Video' }));
    expect(within(screen.getByLabelText('Media format')).getByRole('option', { name: 'MP4' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Media format')).queryByRole('option', { name: 'JPEG' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    const clearSize = screen.getByRole('button', { name: 'Remove Size filter' });
    expect(clearSize).toBeInTheDocument();
    fireEvent.click(clearSize);
    expect(mockOnFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ sizeBucket: 'all' }));
  });

  it('surfaces an active Base64 filter as a removable chip', () => {
    renderToolbar();
    openMore();
    fireEvent.click(screen.getByRole('switch', { name: /base64/i }));
    expect(screen.getByRole('button', { name: 'Remove Base64 filter' })).toBeInTheDocument();
  });

  it('surfaces an active Format filter as a removable chip with the canonical mixed-case label and clears it via ×', () => {
    renderToolbar();
    openMore();
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'webp' } });
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

  it('renders only the kinds present in `available`', () => {
    const onChange = vi.fn();
    const { queryByText } = render(
      <FilterToolbar onFilterChange={onChange} extensionSettings={DEFAULT_SETTINGS}
        available={{ kinds: ['all', 'image'], formats: { image: ['all', 'png'], video: ['all'], audio: ['all'] }, sizeBuckets: ['all', 'small'] }} />,
    );
    expect(queryByText('Images')).toBeTruthy();
    expect(queryByText('Video')).toBeNull();
    expect(queryByText('Audio')).toBeNull();
  });

  it('lists present formats with a data-driven label (AVIF)', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <FilterToolbar onFilterChange={onChange} extensionSettings={DEFAULT_SETTINGS} available={allAvailable} />,
    );
    fireEvent.click(document.querySelector('[aria-controls="filter-more"]') as HTMLElement);
    const select = getByLabelText('Media format') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['all', 'png', 'avif']);
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain('AVIF');
  });

  it('seeds initial filters from initialFilters (page-type default)', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <FilterToolbar onFilterChange={onChange} extensionSettings={DEFAULT_SETTINGS}
        available={allAvailable} initialFilters={{ sizeBucket: 'medium' }} />,
    );
    fireEvent.click(document.querySelector('[aria-controls="filter-more"]') as HTMLElement);
    const medium = getByLabelText('Image size').querySelector('[aria-pressed="true"]');
    expect(medium?.textContent).toBe('Medium');
  });

  it('self-heals a seeded sizeBucket the page cannot satisfy (feed/gallery seed on a small-image page)', () => {
    const onChange = vi.fn();
    render(
      <FilterToolbar onFilterChange={onChange} extensionSettings={DEFAULT_SETTINGS}
        available={{ kinds: ['all', 'image'], formats: { image: ['all', 'png'], video: ['all'], audio: ['all'] }, sizeBuckets: ['all', 'small'] }}
        initialFilters={{ sizeBucket: 'medium' }} />,
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sizeBucket: 'all' }));
  });

  it('resets a stale format selection to all when it leaves `available`', () => {
    const onChange = vi.fn();
    const { rerender, getByLabelText } = render(
      <FilterToolbar onFilterChange={onChange} extensionSettings={DEFAULT_SETTINGS} available={allAvailable} />,
    );
    fireEvent.click(document.querySelector('[aria-controls="filter-more"]') as HTMLElement);
    fireEvent.change(getByLabelText('Media format'), { target: { value: 'avif' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ imageType: 'avif' }));

    rerender(
      <FilterToolbar onFilterChange={onChange} extensionSettings={DEFAULT_SETTINGS}
        available={{ kinds: ['all', 'image'], formats: { image: ['all', 'png'], video: ['all'], audio: ['all'] }, sizeBuckets: ['all', 'small'] }} />,
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ imageType: 'all' }));
  });
});
