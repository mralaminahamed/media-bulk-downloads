import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProgressBar } from '@/extension/popup/components/ProgressBar';

describe('ProgressBar', () => {
  it('renders a determinate bar with the count and aria values', () => {
    render(<ProgressBar label="Zipping" done={3} total={10} />);
    expect(screen.getByText('Zipping 3/10')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
  });

  it('clamps the fill width to 100%', () => {
    const { container } = render(<ProgressBar label="Zipping" done={12} total={10} />);
    const fill = container.querySelector('[style*="width"]') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('renders an indeterminate bar (no count/aria-valuenow) when total is 0', () => {
    render(<ProgressBar label="Fetching videos" total={0} />);
    expect(screen.getByText('Fetching videos…')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });
});
