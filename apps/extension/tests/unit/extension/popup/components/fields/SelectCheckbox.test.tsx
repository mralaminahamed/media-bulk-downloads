import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectCheckbox } from '@/extension/popup/components/fields/SelectCheckbox';

describe('SelectCheckbox', () => {
  it('renders an unchecked checkbox and forwards clicks', () => {
    const onClick = vi.fn();
    render(<SelectCheckbox checked={false} onClick={onClick} ariaLabel="Select item" title="Select item" />);
    const box = screen.getByRole('checkbox', { name: 'Select item' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box).toHaveAttribute('title', 'Select item');
    fireEvent.click(box);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reports aria-checked="true" when checked', () => {
    render(<SelectCheckbox checked onClick={vi.fn()} ariaLabel="Deselect item" />);
    expect(screen.getByRole('checkbox', { name: 'Deselect item' })).toHaveAttribute('aria-checked', 'true');
  });

  it('reports aria-checked="mixed" when indeterminate', () => {
    render(<SelectCheckbox checked={false} indeterminate onClick={vi.fn()} ariaLabel="Select all" className="extra" />);
    const box = screen.getByRole('checkbox', { name: 'Select all' });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    expect(box).toHaveClass('extra');
  });
});
