import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterToolbar from '@/extension/popup/components/FilterToolbar';
import { FilterOptions, SettingsData } from '@/types';

describe('FilterToolbar Component', () => {
  const mockOnFilterChange = jest.fn();
  const mockExtensionSettings: SettingsData = {
    downloadPath: '',
    fileNamePrefix: 'image_',
    popupWidth: 400,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
  };

  beforeEach(() => {
    mockOnFilterChange.mockClear();
  });

  const renderFilterToolbar = () => render(
      <FilterToolbar
          onFilterChange={mockOnFilterChange}
          extensionSettings={mockExtensionSettings}
      />
  );

  it('renders correctly', () => {
    renderFilterToolbar();
    expect(screen.getByText('Filter Images')).toBeInTheDocument();
  });

  it('opens filter options when button is clicked', () => {
    renderFilterToolbar();
    fireEvent.click(screen.getByText('Filter Images'));
    expect(screen.getByLabelText('Image Type')).toBeInTheDocument();
  });

  it('calls onFilterChange when filter is applied', async () => {
    renderFilterToolbar();
    fireEvent.click(screen.getByText('Filter Images'));
    fireEvent.change(screen.getByLabelText('Image Type'), { target: { value: 'jpeg' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({
        imageType: 'jpeg',
      }));
    });
  });

  it('resets filters when reset button is clicked', async () => {
    renderFilterToolbar();
    fireEvent.click(screen.getByText('Filter Images'));
    fireEvent.change(screen.getByLabelText('Image Type'), { target: { value: 'jpeg' } });
    fireEvent.click(screen.getByText('Reset'));

    await waitFor(() => {
      expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({
        imageType: 'all',
        minSize: 0,
        includeBase64: true,
      } as FilterOptions));
    });
  });

  it('updates minimum size filter', async () => {
    renderFilterToolbar();
    fireEvent.click(screen.getByText('Filter Images'));
    fireEvent.change(screen.getByLabelText('Minimum Size (KB)'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({
        minSize: 100,
      }));
    });
  });

  it('toggles include base64 images filter', async () => {
    renderFilterToolbar();
    fireEvent.click(screen.getByText('Filter Images'));
    fireEvent.click(screen.getByLabelText('Include Base64 Images'));
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({
        includeBase64: false,
      }));
    });
  });
});
