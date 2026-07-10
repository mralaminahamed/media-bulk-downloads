import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterChip from '@/extension/popup/components/FilterChip';

describe('FilterChip', () => {
  it('renders a ghost chip (no clear button) when inactive', () => {
    render(<FilterChip label="State" active={false} onOpen={() => {}} showChevron />);
    const body = screen.getByRole('button', { name: 'State' });
    expect(body).toBeInTheDocument();
    expect(body).not.toHaveClass('is-active');
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('renders a filled chip with a clear button when active', () => {
    render(
      <FilterChip label="Downloaded" active onOpen={() => {}} onClear={() => {}} clearLabel="Remove State filter" />,
    );
    expect(screen.getByRole('button', { name: 'Downloaded' })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: 'Remove State filter' })).toBeInTheDocument();
  });

  it('calls onOpen when the body is clicked and onClear when × is clicked, independently', () => {
    const onOpen = vi.fn();
    const onClear = vi.fn();
    render(<FilterChip label="Downloaded" active onOpen={onOpen} onClear={onClear} clearLabel="Remove State filter" />);
    fireEvent.click(screen.getByRole('button', { name: 'Downloaded' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove State filter' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1); // body not re-fired
  });

  it('forwards aria-expanded/controls to the body button', () => {
    render(<FilterChip label="State" active={false} onOpen={() => {}} expanded controls="state-flyout" showChevron />);
    const body = screen.getByRole('button', { name: 'State' });
    expect(body).toHaveAttribute('aria-expanded', 'true');
    expect(body).toHaveAttribute('aria-controls', 'state-flyout');
  });
});
