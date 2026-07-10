import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DownloadQueue } from '@/extension/popup/components/DownloadQueue';
import * as storage from '@/extension/shared/storage/download-queue';
import * as utils from '@/extension/popup/utils';
import type { QueueState } from '@/extension/shared/storage/download-queue';

const setQueue = (s: QueueState) => vi.spyOn(storage, 'loadQueue').mockResolvedValue(s);

it('renders nothing when the queue is empty', async () => {
  setQueue({ paused: false, items: [] });
  const { container } = render(<DownloadQueue />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('shows the summary as an aria-live region with the overall bar and counts', async () => {
  setQueue({ paused: false, items: [
    { id: 'a', url: 'u', filename: 'a', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
    { id: 'b', url: 'u', filename: 'b', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 1, bytesReceived: 5, totalBytes: 10 },
    { id: 'c', url: 'u', filename: 'c', status: 'failed', attempts: 3, error: 'x', readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  const live = await screen.findByRole('status');
  expect(live).toHaveAttribute('aria-live', 'polite');
  expect(live).toHaveTextContent('1 / 3');
  expect(live).toHaveTextContent('1 failed');
});

it('Retry failed shows only when there are failures and dispatches retry-all', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  setQueue({ paused: false, items: [
    { id: 'c', url: 'u', filename: 'c', status: 'failed', attempts: 3, error: 'x', readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: /retry failed/i }));
  expect(send).toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'all-failed' });
});

it('Clear done shows when finished items exist and dispatches QUEUE_CLEAR', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  setQueue({ paused: false, items: [
    { id: 'a', url: 'u', filename: 'a', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: /clear done/i }));
  expect(send).toHaveBeenCalledWith({ type: 'QUEUE_CLEAR' });
});
