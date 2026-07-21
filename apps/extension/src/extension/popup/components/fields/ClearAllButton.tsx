import React, { useEffect, useState } from 'react';

export interface ClearAllButtonProps {
  /** Fired only on the confirming (second) click. */
  onClear: () => void;
  /** Disabled when there's nothing to clear. */
  disabled?: boolean;
  /** Resting label; the confirm aria-label is derived from it. Defaults to "Clear all". */
  label?: string;
}

/**
 * A two-step inline confirm button: the first click arms it ("Confirm?"), a
 * second click within a few seconds fires `onClear`. The confirmation is inline
 * rather than a native `confirm()` because that dialog blurs — and so can
 * dismiss — the extension popup. Auto-disarms after a timeout and on blur, so it
 * never stays armed once the user looks away.
 */
export const ClearAllButton: React.FC<ClearAllButtonProps> = ({ onClear, disabled, label = 'Clear all' }) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const handleClick = (): void => {
    if (disabled) return;
    if (armed) {
      setArmed(false);
      onClear();
    } else {
      setArmed(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      onBlur={() => setArmed(false)}
      disabled={disabled}
      className="btn btn-sm btn-ghost"
      style={armed ? { color: 'var(--warn)' } : undefined}
      aria-label={armed ? `Confirm ${label.toLowerCase()}` : label}
    >
      {armed ? 'Confirm?' : label}
    </button>
  );
};
