import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClearAllButton } from '@/extension/popup/components/fields/ClearAllButton';

describe('ClearAllButton', () => {
  it('renders an enabled "Clear all" by default', () => {
    render(<ClearAllButton onClear={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Clear all' });
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent('Clear all');
  });

  it('is disabled and never fires when disabled', () => {
    const onClear = vi.fn();
    render(<ClearAllButton onClear={onClear} disabled />);
    const btn = screen.getByRole('button', { name: /clear all/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('requires two clicks: first arms, second confirms', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(<ClearAllButton onClear={onClear} />);
    const btn = screen.getByRole('button', { name: /clear all/i });

    await user.click(btn);
    expect(onClear).not.toHaveBeenCalled();
    expect(btn).toHaveTextContent('Confirm?');
    expect(btn.getAttribute('aria-label')).toBe('Confirm clear all');

    await user.click(btn);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(btn).toHaveTextContent('Clear all');
    expect(btn.getAttribute('aria-label')).toBe('Clear all');
  });

  it('disarms on blur without firing', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <ClearAllButton onClear={onClear} />
        <button>other</button>
      </>,
    );
    const btn = screen.getByRole('button', { name: /clear all/i });
    await user.click(btn);
    expect(btn).toHaveTextContent('Confirm?');

    await user.click(screen.getByRole('button', { name: 'other' }));
    expect(btn).toHaveTextContent('Clear all');
    expect(onClear).not.toHaveBeenCalled();
  });

  it('auto-disarms after the timeout without firing', async () => {
    vi.useFakeTimers();
    try {
      const onClear = vi.fn();
      render(<ClearAllButton onClear={onClear} />);
      const btn = screen.getByRole('button', { name: /clear all/i });
      fireEvent.click(btn);
      expect(btn).toHaveTextContent('Confirm?');

      await act(async () => { vi.advanceTimersByTime(3000); });
      expect(btn).toHaveTextContent('Clear all');
      expect(onClear).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
