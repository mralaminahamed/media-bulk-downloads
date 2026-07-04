import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useDialog } from '@/extension/popup/hooks/useDialog';

const Dialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useDialog(onClose);
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button>x</button>
    </div>
  );
};

describe('useDialog', () => {
  it('does not re-focus the panel when the parent re-renders with a fresh onClose', () => {
    const focusSpy = jest.spyOn(HTMLDivElement.prototype, 'focus');
    const { rerender } = render(<Dialog onClose={() => {}} />);
    const afterMount = focusSpy.mock.calls.length; // panel focused once on open
    expect(afterMount).toBeGreaterThanOrEqual(1);

    // Each render passes a new onClose identity (as real consumers do). The
    // effect must NOT re-run and steal focus.
    rerender(<Dialog onClose={() => {}} />);
    rerender(<Dialog onClose={() => {}} />);
    expect(focusSpy.mock.calls.length).toBe(afterMount);

    focusSpy.mockRestore();
  });

  it('Escape calls the latest onClose, not a stale one', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<Dialog onClose={first} />);
    rerender(<Dialog onClose={second} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
