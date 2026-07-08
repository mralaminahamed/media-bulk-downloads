import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorState } from '@/extension/popup/components/states/ErrorState';

describe('ErrorState', () => {
  it('strips the "Can\'t read this page:" prefix and shows the remaining message', () => {
    render(<ErrorState message="Can't read this page: boom happened" onRetry={jest.fn()} />);
    expect(screen.getByText('boom happened')).toBeInTheDocument();
    expect(screen.getByText('Can\'t read this page')).toBeInTheDocument();
  });

  it('falls back to the default restricted-pages body when the message is empty', () => {
    render(<ErrorState message="" onRetry={jest.fn()} />);
    expect(screen.getByText(/restricted and can't be scanned/i)).toBeInTheDocument();
  });

  it('calls onRetry when the Try again button is clicked', () => {
    const onRetry = jest.fn();
    render(<ErrorState message="nope" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
