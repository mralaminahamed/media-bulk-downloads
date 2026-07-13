import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChipFlyout from '@/extension/popup/components/ChipFlyout';

const opts = [
  { value: 'all', label: 'All items' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'not-downloaded', label: 'Not downloaded' },
] as const;

const setup = (value: 'all' | 'downloaded' | 'not-downloaded', onChange = vi.fn()) => {
  render(
    <ChipFlyout
      id="state-flyout"
      triggerLabel="State"
      valueLabel={(v) => opts.find((o) => o.value === v)!.label}
      options={opts as unknown as { value: string; label: string }[]}
      value={value}
      defaultValue="all"
      onChange={onChange as (v: string) => void}
      clearLabel="Remove State filter"
    />,
  );
  return onChange;
};

describe('ChipFlyout', () => {
  it('shows the ghost trigger label when at default, no menu until opened', () => {
    setup('all');
    expect(screen.getByRole('button', { name: 'State' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the menu and selecting an option emits it and closes', () => {
    const onChange = setup('all');
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Downloaded' }));
    expect(onChange).toHaveBeenCalledWith('downloaded');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('when active, the trigger shows the value label and × resets to default', () => {
    const onChange = setup('downloaded');
    expect(screen.getByRole('button', { name: 'Downloaded' })).toHaveClass('is-active');
    fireEvent.click(screen.getByRole('button', { name: 'Remove State filter' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('Escape closes the open menu', () => {
    setup('all');
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu on an outside mousedown', () => {
    setup('all');
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
