import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadQueue } from '@/extension/popup/components/DownloadQueue';
import { QUEUE_KEY } from '@/extension/shared/storage/download-queue';

let sendMessage: ReturnType<typeof vi.fn>;
let permRequest: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const store: Record<string, unknown> = { [QUEUE_KEY]: { paused: false, items: [
    { id: 'a', url: 'u1', filename: 'f1', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
    { id: 'b', url: 'u2', filename: 'f2', status: 'failed', attempts: 3, error: 'SERVER_FAILED', readyAt: 0, addedAt: 0 },
    { id: 'c', url: 'u3', filename: 'f3', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
    { id: 'd', url: 'u4', filename: 'f4', status: 'failed', attempts: 0, error: 'SERVER_FORBIDDEN', hotlink: true, readyAt: 0, addedAt: 0 },
  ] } };
  sendMessage = vi.fn(async () => ({ status: 'success' }));
  permRequest = vi.fn(async () => true);
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k: string) => (typeof k === 'string' && k in store ? { [k]: store[k] } : {})),
        set: vi.fn(async () => {}),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    permissions: { request: permRequest, contains: vi.fn(async () => false) },
    runtime: { sendMessage, lastError: undefined },
  } as unknown as typeof chrome;
});

describe('DownloadQueue', () => {
  it('renders progress (done/total) and a failed row with its reason', async () => {
    render(<DownloadQueue />);
    expect(await screen.findByText(/1\s*\/\s*4/)).toBeInTheDocument();
    expect(await screen.findByText(/SERVER_FORBIDDEN/)).toBeInTheDocument();
  });

  it('sends a plain QUEUE_RETRY for an ordinary failed item', async () => {
    render(<DownloadQueue />);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'b' });
  });

  it('a hotlink 403 shows "Retry w/ referer"; clicking requests the permission then retries with referer', async () => {
    render(<DownloadQueue />);
    const btn = await screen.findByRole('button', { name: /retry w\/ referer/i });
    fireEvent.click(btn);
    await Promise.resolve();
    await Promise.resolve();
    expect(permRequest).toHaveBeenCalledWith({ permissions: ['declarativeNetRequest'] });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'd', referer: true });
  });

  it('does not retry when the permission is denied', async () => {
    permRequest.mockResolvedValueOnce(false);
    render(<DownloadQueue />);
    fireEvent.click(await screen.findByRole('button', { name: /retry w\/ referer/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ referer: true }));
  });

  it('sends QUEUE_PAUSE from the pause control', async () => {
    render(<DownloadQueue />);
    const pause = await screen.findByRole('button', { name: /pause/i });
    fireEvent.click(pause);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUEUE_PAUSE' });
  });

  it('renders nothing when the queue is empty', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ [QUEUE_KEY]: { paused: false, items: [] } });
    const { container } = render(<DownloadQueue />);
    // findBy would throw on absence; assert the section never appears.
    await Promise.resolve();
    expect(container.querySelector('.download-queue')).toBeNull();
  });
});
