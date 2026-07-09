import type { Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryPanel from '@/extension/popup/components/panels/HistoryPanel';
import * as history from '@/extension/shared/storage/history';

const entry = {
  src: 'https://c/a.jpg', filename: 'a.jpg', kind: 'image' as const, type: 'jpeg',
  sourcePageUrl: 'https://page.example', time: Date.now(), downloadId: 12,
};

// Grabs the storage.onChanged listener the panel registered on mount so a test
// can drive a storage-change event through it.
type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const lastStorageListener = (): ChangeListener => {
  const calls = (chrome.storage.onChanged.addListener as Mock).mock.calls;
  return calls[calls.length - 1][0] as ChangeListener;
};

describe('HistoryPanel', () => {
  beforeEach(() => {
    vi.spyOn(history, 'loadHistory').mockResolvedValue([entry]);
    (chrome.runtime.sendMessage as Mock).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists entries and clears all via the background after a two-step confirm', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: /clear all/i });
    await userEvent.click(clearBtn); // arms only
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'CLEAR_HISTORY' });
    await userEvent.click(clearBtn); // confirms
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_HISTORY' });
  });

  it('removes an entry via the background', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'REMOVE_HISTORY_ENTRY', src: 'https://c/a.jpg' });
  });

  it('re-downloads an entry', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /re-download/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
    );
  });

  it('shows an empty state', async () => {
    (history.loadHistory as Mock).mockResolvedValue([]);
    render(<HistoryPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument());
  });

  it('opens the source URL, the local file, and the containing folder', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /open source in new tab/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_URL', url: 'https://c/a.jpg' });
    await userEvent.click(screen.getByRole('button', { name: /open file/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_DOWNLOAD_FILE', downloadId: 12 });
    await userEvent.click(screen.getByRole('button', { name: /show in folder/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'SHOW_DOWNLOAD', downloadId: 12 });
  });

  it('hides file/folder actions for entries with no downloadId (legacy)', async () => {
    (history.loadHistory as Mock).mockResolvedValue([{ ...entry, downloadId: undefined }]);
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    // The Open-file / Show-in-folder buttons are the ONLY callers of openFile /
    // revealFile, and they only render when downloadId is defined. That is why the
    // `if (entry.downloadId === undefined) return;` guards inside those handlers are
    // defensively unreachable through the UI — this test documents that pairing by
    // proving the buttons are absent for a legacy (no-downloadId) entry.
    expect(screen.queryByRole('button', { name: /open file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show in folder/i })).not.toBeInTheDocument();
    // Source-URL open still works without a downloadId.
    expect(screen.getByRole('button', { name: /open source in new tab/i })).toBeInTheDocument();
  });

  it('is a labelled modal dialog that closes on Escape', async () => {
    const onClose = vi.fn();
    render(<HistoryPanel onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Download History' })).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the raw sourcePageUrl as host text when it is malformed', async () => {
    (history.loadHistory as Mock).mockResolvedValue([{ ...entry, sourcePageUrl: 'not a url' }]);
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    expect(screen.getByRole('link', { name: 'not a url' })).toHaveAttribute('href', 'not a url');
  });

  it('omits the source link when there is no sourcePageUrl', async () => {
    (history.loadHistory as Mock).mockResolvedValue([{ ...entry, sourcePageUrl: '' }]);
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sorts entries newest-first', async () => {
    (history.loadHistory as Mock).mockResolvedValue([
      { ...entry, src: 'https://c/old.jpg', filename: 'old.jpg', time: 1000 },
      { ...entry, src: 'https://c/new.jpg', filename: 'new.jpg', time: 2000 },
    ]);
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('new.jpg');
    const names = screen.getAllByText(/^(old|new)\.jpg$/).map((n) => n.textContent);
    expect(names).toEqual(['new.jpg', 'old.jpg']);
  });

  it('renders the thumbnail when present and includes it in the re-download payload', async () => {
    (history.loadHistory as Mock).mockResolvedValue([{ ...entry, thumbnailSrc: 'https://c/thumb.jpg' }]);
    render(<HistoryPanel onClose={() => {}} />);
    const img = await screen.findByAltText('a.jpg');
    expect(img).toHaveAttribute('src', 'https://c/thumb.jpg');
    await userEvent.click(screen.getByRole('button', { name: /re-download/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DOWNLOAD_IMAGES',
      images: [expect.objectContaining({ thumbnailSrc: 'https://c/thumb.jpg' })],
    }));
  });

  it('reloads on a relevant history storage change and ignores irrelevant ones', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    const listener = lastStorageListener();
    (history.loadHistory as Mock).mockResolvedValue([{ ...entry, src: 'https://c/b.jpg', filename: 'b.jpg' }]);

    // Wrong area and wrong key are both ignored — no reload.
    await act(async () => { listener({ [history.HISTORY_KEY]: {} }, 'sync'); });
    await act(async () => { listener({ somethingElse: {} }, 'local'); });
    expect(history.loadHistory).toHaveBeenCalledTimes(1);

    // A local change to the history key reloads and reflects the new data.
    await act(async () => { listener({ [history.HISTORY_KEY]: {} }, 'local'); });
    expect(await screen.findByText('b.jpg')).toBeInTheDocument();
    expect(history.loadHistory).toHaveBeenCalledTimes(2);
  });
});
