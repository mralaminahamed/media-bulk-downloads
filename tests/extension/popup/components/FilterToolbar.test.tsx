import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterToolbar from './../../../../src/extension/popup/components/FilterToolbar';

describe('FilterToolbar Component', () => {
  const mockOnFilterChange = jest.fn();

  beforeEach(() => {
    mockOnFilterChange.mockClear();
  });

  it('renders correctly', () => {
    render(<FilterToolbar onFilterChange={mockOnFilterChange} />);
    expect(screen.getByText('Filter Images')).toBeInTheDocument();
  });

  it('opens filter options when button is clicked', () => {
    render(<FilterToolbar onFilterChange={mockOnFilterChange} />);
    fireEvent.click(screen.getByText('Filter Images'));
    expect(screen.getByLabelText('Image Type')).toBeInTheDocument();
  });

  it('calls onFilterChange when filter is applied', () => {
    render(<FilterToolbar onFilterChange={mockOnFilterChange} />);
    fireEvent.click(screen.getByText('Filter Images'));
    fireEvent.change(screen.getByLabelText('Image Type'), { target: { value: 'jpeg' } });
    fireEvent.click(screen.getByText('Apply Filters'));
    expect(mockOnFilterChange).toHaveBeenCalled();
  });

  it('resets filters when reset button is clicked', () => {
    render(<FilterToolbar onFilterChange={mockOnFilterChange} />);
    fireEvent.click(screen.getByText('Filter Images'));
    fireEvent.change(screen.getByLabelText('Image Type'), { target: { value: 'jpeg' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(mockOnFilterChange).toHaveBeenCalledWith(expect.objectContaining({
      imageType: 'all',
      minSize: 0,
      includeBase64: true,
    }));
  });
});