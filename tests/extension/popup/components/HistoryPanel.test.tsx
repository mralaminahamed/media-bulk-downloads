import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryPanel from '@/extension/popup/components/HistoryPanel';
import * as history from '@/extension/shared/storage/history';

const entry = {
  src: 'https://c/a.jpg', filename: 'a.jpg', kind: 'image' as const, type: 'jpeg',
  sourcePageUrl: 'https://page.example', time: Date.now(), downloadId: 12,
};

describe('HistoryPanel', () => {
  beforeEach(() => {
    jest.spyOn(history, 'loadHistory').mockResolvedValue([entry]);
    (chrome.runtime.sendMessage as jest.Mock).mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists entries and clears all via the background', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
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
    (history.loadHistory as jest.Mock).mockResolvedValue([]);
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
    (history.loadHistory as jest.Mock).mockResolvedValue([{ ...entry, downloadId: undefined }]);
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    expect(screen.queryByRole('button', { name: /open file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show in folder/i })).not.toBeInTheDocument();
    // Source-URL open still works without a downloadId.
    expect(screen.getByRole('button', { name: /open source in new tab/i })).toBeInTheDocument();
  });

  it('is a labelled modal dialog that closes on Escape', async () => {
    const onClose = jest.fn();
    render(<HistoryPanel onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Download History' })).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
