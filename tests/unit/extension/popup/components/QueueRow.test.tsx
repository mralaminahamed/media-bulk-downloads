import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueRow } from '@/extension/popup/components/QueueRow';
import type { QueueItem } from '@mbd/storage/download-queue';

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: 'a', url: 'u', filename: 'photo.jpg', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0, ...over,
});
const noop = () => {};
const props = { onCancel: noop, onRetry: noop, onRetryReferer: noop, onOpen: noop };

it('shows a % + progress bar for an active item', () => {
  render(<ul><QueueRow item={item({ status: 'active', downloadId: 1, bytesReceived: 500, totalBytes: 1000 })} {...props} /></ul>);
  expect(screen.getByText('50%')).toBeInTheDocument();
  expect(screen.getByLabelText('Downloading')).toBeInTheDocument();
});

it('the status icon is decorative and its label lives on a labelled wrapper (a11y)', () => {
  const { container } = render(<ul><QueueRow item={item({ status: 'active', downloadId: 1 })} {...props} /></ul>);
  const labelled = screen.getByLabelText('Downloading');
  expect(labelled).toHaveAttribute('role', 'img');
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).not.toHaveAttribute('aria-label');
});

it('a done item exposes Open', async () => {
  const onOpen = vi.fn();
  render(<ul><QueueRow item={item({ status: 'done', downloadId: 9 })} {...props} onOpen={onOpen} /></ul>);
  await userEvent.click(screen.getByRole('button', { name: 'Open file' }));
  expect(onOpen).toHaveBeenCalledWith('a');
});

it('a failed hotlink item offers Retry w/ referer; a plain failed offers Retry', async () => {
  const onRetryReferer = vi.fn(); const onRetry = vi.fn();
  const { rerender } = render(<ul><QueueRow item={item({ status: 'failed', error: '403', hotlink: true })} {...props} onRetryReferer={onRetryReferer} /></ul>);
  await userEvent.click(screen.getByRole('button', { name: /referer/i }));
  expect(onRetryReferer).toHaveBeenCalledWith('a');
  rerender(<ul><QueueRow item={item({ status: 'failed', error: 'x' })} {...props} onRetry={onRetry} /></ul>);
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledWith('a');
});

it('a failed item shows its error reason', () => {
  render(<ul><QueueRow item={item({ status: 'failed', error: 'SERVER_FORBIDDEN' })} {...props} /></ul>);
  expect(screen.getByText('SERVER_FORBIDDEN')).toBeInTheDocument();
});

it('a queued item offers Cancel and no progress bar', async () => {
  const onCancel = vi.fn();
  render(<ul><QueueRow item={item({ status: 'queued' })} {...props} onCancel={onCancel} /></ul>);
  expect(screen.queryByText('%', { exact: false })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledWith('a');
});
