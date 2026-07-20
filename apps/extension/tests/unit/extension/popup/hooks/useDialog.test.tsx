import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDialog } from '@/extension/popup/hooks/useDialog';

const Dialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useDialog(onClose);
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button>x</button>
    </div>
  );
};

const Trap: React.FC<{ onClose: () => void; active?: boolean }> = ({ onClose, active = true }) => {
  const ref = useDialog(onClose, active);
  return (
    <div ref={ref} role="dialog" aria-modal tabIndex={-1}>
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
};

const Empty: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useDialog(onClose);
  return (
    <div ref={ref} role="dialog" aria-modal tabIndex={-1}>
      nothing to focus here
    </div>
  );
};

describe('useDialog', () => {
  it('does not re-focus the panel when the parent re-renders with a fresh onClose', () => {
    const focusSpy = vi.spyOn(HTMLDivElement.prototype, 'focus');
    const { rerender } = render(<Dialog onClose={() => {}} />);
    const afterMount = focusSpy.mock.calls.length;
    expect(afterMount).toBeGreaterThanOrEqual(1);

    rerender(<Dialog onClose={() => {}} />);
    rerender(<Dialog onClose={() => {}} />);
    expect(focusSpy.mock.calls.length).toBe(afterMount);

    focusSpy.mockRestore();
  });

  it('Escape calls the latest onClose, not a stale one', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog onClose={first} />);
    rerender(<Dialog onClose={second} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('focuses the panel on open', () => {
    render(<Trap onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('does nothing while inactive (no Escape close)', () => {
    const onClose = vi.fn();
    render(<Trap onClose={onClose} active={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps Tab forward — from the last focusable it wraps to the first', () => {
    render(<Trap onClose={vi.fn()} />);
    screen.getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('traps Shift+Tab backward — from the first focusable it wraps to the last', () => {
    render(<Trap onClose={vi.fn()} />);
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('lets Tab through when focus is in the middle (no wrap)', () => {
    render(<Trap onClose={vi.fn()} />);
    const middle = screen.getByText('middle');
    middle.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(middle);
  });

  it('ignores keys other than Tab and Escape', () => {
    const onClose = vi.fn();
    render(<Trap onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes Tab a no-op in a dialog with no focusable children (no wrap, no crash)', () => {
    const onClose = vi.fn();
    render(<Empty onClose={onClose} />);
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restores focus to the previously focused element on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Trap onClose={vi.fn()} />);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
