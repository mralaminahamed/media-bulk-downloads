import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StreamVariantSelect from '@/extension/popup/components/StreamVariantSelect';
import type { VariantState } from '@/extension/popup/hooks/useStreamVariants';

const DONE: VariantState = {
  status: 'done',
  variants: [
    { height: 1080, bandwidth: 5_000_000, label: '1080p · 5.0 Mbps' },
    { height: 480, bandwidth: 800_000, label: '480p · 800 kbps' },
  ],
};

describe('StreamVariantSelect', () => {
  it('fires onEnsure on first open (focus), not on render', () => {
    const onEnsure = vi.fn();
    render(<StreamVariantSelect state={{ status: 'idle', variants: [] }} value={null} onEnsure={onEnsure} onChange={() => {}} />);
    expect(onEnsure).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole('combobox'));
    expect(onEnsure).toHaveBeenCalledTimes(1);
  });

  it('renders Auto + one option per height and reports the chosen height', async () => {
    const onChange = vi.fn();
    render(<StreamVariantSelect state={DONE} value={null} onEnsure={() => {}} onChange={onChange} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1080' } });
    expect(onChange).toHaveBeenCalledWith(1080);
  });

  it('reports null when Auto is re-selected', () => {
    const onChange = vi.fn();
    render(<StreamVariantSelect state={DONE} value={1080} onEnsure={() => {}} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'auto' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
