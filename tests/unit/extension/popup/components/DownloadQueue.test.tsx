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

it('a hotlink failed row\'s "Retry w/ referer" requests the permission, then retries with referer when granted', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  (chrome.permissions.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
  setQueue({ paused: false, items: [
    { id: 'd', url: 'u', filename: 'd', status: 'failed', attempts: 0, error: 'SERVER_FORBIDDEN', hotlink: true, readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: /retry w\/ referer/i }));
  await waitFor(() => expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ['declarativeNetRequestWithHostAccess'] }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'd', referer: true }));
});

it('does not retry when the referer permission request is denied', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  (chrome.permissions.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
  setQueue({ paused: false, items: [
    { id: 'e', url: 'u', filename: 'e', status: 'failed', attempts: 0, error: 'SERVER_FORBIDDEN', hotlink: true, readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: /retry w\/ referer/i }));
  await waitFor(() => expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ['declarativeNetRequestWithHostAccess'] }));
  // Flush the microtask queue past the `if (granted)` check before asserting the negative.
  await Promise.resolve();
  await Promise.resolve();
  expect(send).not.toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'e', referer: true });
});

it('sends QUEUE_PAUSE from the Pause control', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  setQueue({ paused: false, items: [
    { id: 'f', url: 'u', filename: 'f', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: 'Pause' }));
  expect(send).toHaveBeenCalledWith({ type: 'QUEUE_PAUSE' });
});

it('sends QUEUE_RESUME from the Resume control when already paused', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  setQueue({ paused: true, items: [
    { id: 'g', url: 'u', filename: 'g', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: 'Resume' }));
  expect(send).toHaveBeenCalledWith({ type: 'QUEUE_RESUME' });
});

it('sends a plain QUEUE_RETRY for an ordinary (non-hotlink) failed row', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  setQueue({ paused: false, items: [
    { id: 'h', url: 'u', filename: 'h', status: 'failed', attempts: 3, error: 'SERVER_FAILED', readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(send).toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'h' });
});

it('sends QUEUE_OPEN from a done row\'s Open control', async () => {
  const send = vi.spyOn(utils, 'sendRuntimeMessage').mockImplementation(() => {});
  setQueue({ paused: false, items: [
    { id: 'i', url: 'u', filename: 'i', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
  ] });
  render(<DownloadQueue />);
  await userEvent.click(await screen.findByRole('button', { name: 'Open file' }));
  expect(send).toHaveBeenCalledWith({ type: 'QUEUE_OPEN', id: 'i' });
});
