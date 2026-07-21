import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilteredEmptyState } from '@/extension/popup/components/states/FilteredEmptyState';

const props = (over = {}) => ({
  hiddenCount: 42,
  allDownloaded: false,
  deepScanning: false,
  onClearFilters: vi.fn(),
  onDeepScan: vi.fn(),
  ...over,
});

describe('FilteredEmptyState', () => {
  it('reports how many items are hidden by the active filters', () => {
    render(<FilteredEmptyState {...props({ hiddenCount: 42 })} />);
    expect(screen.getByText(/nothing matches your filters/i)).toBeInTheDocument();
    expect(screen.getByText(/42 items/i)).toBeInTheDocument();
  });

  it('adds the "downloaded everything" line only when allDownloaded is true', () => {
    const { rerender } = render(<FilteredEmptyState {...props({ allDownloaded: false })} />);
    expect(screen.queryByText(/downloaded everything that matched/i)).not.toBeInTheDocument();
    rerender(<FilteredEmptyState {...props({ allDownloaded: true })} />);
    expect(screen.getByText(/downloaded everything that matched/i)).toBeInTheDocument();
  });

  it('fires onClearFilters and onDeepScan from their buttons', async () => {
    const p = props();
    const user = userEvent.setup();
    render(<FilteredEmptyState {...p} />);
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(p.onClearFilters).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /deep scan/i }));
    expect(p.onDeepScan).toHaveBeenCalledTimes(1);
  });

  it('shows a stop label while a deep scan is running', () => {
    render(<FilteredEmptyState {...props({ deepScanning: true })} />);
    expect(screen.getByRole('button', { name: /stop deep scan/i })).toBeInTheDocument();
  });
});
