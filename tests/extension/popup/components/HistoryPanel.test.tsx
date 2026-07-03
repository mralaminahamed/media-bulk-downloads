import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryPanel from '@/extension/popup/components/HistoryPanel';
import * as history from '@/extension/shared/history';

const entry = {
  src: 'https://c/a.jpg', filename: 'a.jpg', kind: 'image' as const, type: 'jpeg',
  sourcePageUrl: 'https://page.example', time: Date.now(),
};

describe('HistoryPanel', () => {
  beforeEach(() => {
    jest.spyOn(history, 'loadHistory').mockResolvedValue([entry]);
    jest.spyOn(history, 'removeEntry').mockResolvedValue();
    jest.spyOn(history, 'clearHistory').mockResolvedValue();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists entries and clears all', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(history.clearHistory).toHaveBeenCalled();
  });

  it('removes an entry', async () => {
    render(<HistoryPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(history.removeEntry).toHaveBeenCalledWith('https://c/a.jpg');
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
});
