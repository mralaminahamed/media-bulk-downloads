import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadQueue } from '@/extension/popup/components/DownloadQueue';
import { QUEUE_KEY } from '@/extension/shared/storage/download-queue';

let sendMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const store: Record<string, unknown> = { [QUEUE_KEY]: { paused: false, items: [
    { id: 'a', url: 'u1', filename: 'f1', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
    { id: 'b', url: 'u2', filename: 'f2', status: 'failed', attempts: 3, error: 'SERVER_FORBIDDEN', readyAt: 0, addedAt: 0 },
    { id: 'c', url: 'u3', filename: 'f3', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
  ] } };
  sendMessage = vi.fn(async () => ({ status: 'success' }));
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k: string) => (typeof k === 'string' && k in store ? { [k]: store[k] } : {})),
        set: vi.fn(async () => {}),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage, lastError: undefined },
  } as unknown as typeof chrome;
});

describe('DownloadQueue', () => {
  it('renders progress (done/total) and a failed row with its reason', async () => {
    render(<DownloadQueue />);
    expect(await screen.findByText(/1\s*\/\s*3/)).toBeInTheDocument();
    expect(await screen.findByText(/SERVER_FORBIDDEN/)).toBeInTheDocument();
  });

  it('sends QUEUE_RETRY for a failed item', async () => {
    render(<DownloadQueue />);
    const retry = await screen.findByRole('button', { name: /retry/i });
    fireEvent.click(retry);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUEUE_RETRY', id: 'b' });
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
