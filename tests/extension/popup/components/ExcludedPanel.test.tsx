import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExcludedPanel from '@/extension/popup/components/ExcludedPanel';
import * as excluded from '@/extension/shared/storage/excluded';

const urlEntry = { value: 'https://c/a.jpg', kind: 'url' as const, time: Date.now() };
const hostEntry = { value: 'cdn.ads.com', kind: 'host' as const, time: Date.now() };

describe('ExcludedPanel', () => {
  beforeEach(() => {
    jest.spyOn(excluded, 'loadExcluded').mockResolvedValue([urlEntry, hostEntry]);
    (chrome.runtime.sendMessage as jest.Mock).mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists both a url and a host entry with their kind tags', async () => {
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('cdn.ads.com')).toBeInTheDocument();
    expect(screen.getByText('URL')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
  });

  it('removes the host entry via the background', async () => {
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('cdn.ads.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove cdn\.ads\.com/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REMOVE_EXCLUDED', kind: 'host', value: 'cdn.ads.com' }),
    );
  });

  it('clears all via the background', async () => {
    render(<ExcludedPanel onClose={() => {}} />);
    await screen.findByText('cdn.ads.com');
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_EXCLUDED' });
  });

  it('shows an empty state when there are no excluded sources', async () => {
    jest.spyOn(excluded, 'loadExcluded').mockResolvedValue([]);
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('No excluded sources.')).toBeInTheDocument();
  });
});
