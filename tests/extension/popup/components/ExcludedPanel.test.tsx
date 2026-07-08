import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExcludedPanel from '@/extension/popup/components/ExcludedPanel';
import * as excluded from '@/extension/shared/storage/excluded';

const urlEntry = { value: 'https://c/a.jpg', kind: 'url' as const, time: Date.now() };
const hostEntry = { value: 'cdn.ads.com', kind: 'host' as const, time: Date.now() };

// Grabs the storage.onChanged listener the panel registered on mount so a test
// can drive a storage-change event through it.
type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const lastStorageListener = (): ChangeListener => {
  const calls = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as ChangeListener;
};

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

  it('clears all via the background after a two-step confirm', async () => {
    render(<ExcludedPanel onClose={() => {}} />);
    await screen.findByText('cdn.ads.com');
    const clearBtn = screen.getByRole('button', { name: /clear all/i });
    await userEvent.click(clearBtn); // first click only arms — nothing cleared yet
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'CLEAR_EXCLUDED' });
    await userEvent.click(clearBtn); // second click confirms
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_EXCLUDED' });
  });

  it('shows an empty state when there are no excluded sources', async () => {
    jest.spyOn(excluded, 'loadExcluded').mockResolvedValue([]);
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('No excluded sources.')).toBeInTheDocument();
  });

  it('removes a url entry via the background', async () => {
    render(<ExcludedPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    fireEvent.click(screen.getByRole('button', { name: /remove https:\/\/c\/a\.jpg/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REMOVE_EXCLUDED', kind: 'url', value: 'https://c/a.jpg' }),
    );
  });

  it('labels a url entry with a non-URL value using the raw string', async () => {
    jest.spyOn(excluded, 'loadExcluded').mockResolvedValue([{ value: 'not a url', kind: 'url', time: Date.now() }]);
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('not a url')).toBeInTheDocument();
  });

  it('labels a data: url entry readably instead of the raw payload', async () => {
    jest.spyOn(excluded, 'loadExcluded').mockResolvedValue([
      { value: 'data:image/png;base64,AAAABBBBCCCC', kind: 'url', time: Date.now() },
    ]);
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('Embedded image')).toBeInTheDocument();
  });

  it('labels a url entry by host when there is no basename, and by raw value when there is no host', async () => {
    jest.spyOn(excluded, 'loadExcluded').mockResolvedValue([
      { value: 'https://host.example/', kind: 'url', time: 2000 },
      { value: 'file:///', kind: 'url', time: 1000 },
    ]);
    render(<ExcludedPanel onClose={() => {}} />);
    expect(await screen.findByText('host.example')).toBeInTheDocument();
    expect(screen.getByText('file:///')).toBeInTheDocument();
  });

  it('reloads on a relevant excluded storage change and ignores irrelevant ones', async () => {
    render(<ExcludedPanel onClose={() => {}} />);
    await screen.findByText('cdn.ads.com');
    const listener = lastStorageListener();
    (excluded.loadExcluded as jest.Mock).mockResolvedValue([{ value: 'evil.example', kind: 'host', time: Date.now() }]);

    // Wrong area and wrong key are both ignored — no reload.
    await act(async () => { listener({ [excluded.EXCLUDED_KEY]: {} }, 'sync'); });
    await act(async () => { listener({ somethingElse: {} }, 'local'); });
    expect(excluded.loadExcluded).toHaveBeenCalledTimes(1);

    // A local change to the excluded key reloads and reflects the new data.
    await act(async () => { listener({ [excluded.EXCLUDED_KEY]: {} }, 'local'); });
    expect(await screen.findByText('evil.example')).toBeInTheDocument();
    expect(excluded.loadExcluded).toHaveBeenCalledTimes(2);
  });
});
