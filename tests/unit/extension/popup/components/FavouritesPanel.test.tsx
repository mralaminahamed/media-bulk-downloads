import type { Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FavouritesPanel from '@/extension/popup/components/FavouritesPanel';
import * as favourites from '@/extension/shared/storage/favourites';

const entry = {
  src: 'https://c/a.jpg', kind: 'image' as const, type: 'jpeg',
  sourcePageUrl: 'https://page.example', time: Date.now(),
};

// Grabs the storage.onChanged listener the panel registered on mount so a test
// can drive a storage-change event through it.
type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const lastStorageListener = (): ChangeListener => {
  const calls = (chrome.storage.onChanged.addListener as Mock).mock.calls;
  return calls[calls.length - 1][0] as ChangeListener;
};

describe('FavouritesPanel', () => {
  beforeEach(() => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([entry]);
    (chrome.runtime.sendMessage as Mock).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists entries and clears all via the background after a two-step confirm', async () => {
    render(<FavouritesPanel onClose={() => {}} />);
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: /clear all/i });
    await userEvent.click(clearBtn); // arms only
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'CLEAR_FAVOURITES' });
    await userEvent.click(clearBtn); // confirms
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_FAVOURITES' });
  });

  it('removes an entry via the background', async () => {
    render(<FavouritesPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'REMOVE_FAVOURITE', src: 'https://c/a.jpg' });
  });

  it('downloads an entry through the download flow', async () => {
    render(<FavouritesPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /^download$/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DOWNLOAD_IMAGES',
      sourcePage: { url: 'https://page.example', title: undefined },
    }));
  });

  it('labels a base64 (data:) favourite readably, not with the raw payload', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([
      { ...entry, src: 'data:image/png;base64,AAAABBBBCCCCDDDD' },
    ]);
    render(<FavouritesPanel onClose={() => {}} />);
    expect(await screen.findByText('Embedded image')).toBeInTheDocument();
  });

  it('opens the source page URL when present', async () => {
    render(<FavouritesPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    await userEvent.click(screen.getByRole('button', { name: /open source in new tab/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_URL', url: 'https://page.example' });
  });

  it('falls back to the media src and shows no source link when sourcePageUrl is absent', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([{ ...entry, sourcePageUrl: '' }]);
    render(<FavouritesPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open source in new tab/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_URL', url: 'https://c/a.jpg' });
  });

  it('labels a favourite whose src is not a URL with the raw string', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([{ ...entry, src: 'not a url', sourcePageUrl: '' }]);
    render(<FavouritesPanel onClose={() => {}} />);
    expect(await screen.findByText('not a url')).toBeInTheDocument();
  });

  it('shows the raw sourcePageUrl as host text when it is malformed', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([{ ...entry, sourcePageUrl: 'not a url' }]);
    render(<FavouritesPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    expect(screen.getByRole('link', { name: 'not a url' })).toHaveAttribute('href', 'not a url');
  });

  it('renders the thumbnail when present and includes it in the download payload', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([{ ...entry, thumbnailSrc: 'https://c/thumb.jpg' }]);
    render(<FavouritesPanel onClose={() => {}} />);
    const img = await screen.findByAltText('a.jpg');
    expect(img).toHaveAttribute('src', 'https://c/thumb.jpg');
    await userEvent.click(screen.getByRole('button', { name: /^download$/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DOWNLOAD_IMAGES',
      images: [expect.objectContaining({ thumbnailSrc: 'https://c/thumb.jpg' })],
    }));
  });

  it('reloads on a relevant favourites storage change and ignores irrelevant ones', async () => {
    render(<FavouritesPanel onClose={() => {}} />);
    await screen.findByText('a.jpg');
    const listener = lastStorageListener();
    (favourites.loadFavourites as Mock).mockResolvedValue([{ ...entry, src: 'https://c/b.jpg' }]);

    // Wrong area and wrong key are both ignored — no reload.
    await act(async () => { listener({ [favourites.FAVOURITES_KEY]: {} }, 'sync'); });
    await act(async () => { listener({ somethingElse: {} }, 'local'); });
    expect(favourites.loadFavourites).toHaveBeenCalledTimes(1);
    expect(screen.getByText('a.jpg')).toBeInTheDocument();

    // A local change to the favourites key reloads and reflects the new data.
    await act(async () => { listener({ [favourites.FAVOURITES_KEY]: {} }, 'local'); });
    expect(await screen.findByText('b.jpg')).toBeInTheDocument();
    expect(favourites.loadFavourites).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when there are no favourites', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([]);
    render(<FavouritesPanel onClose={() => {}} />);
    expect(await screen.findByText('No favourites yet')).toBeInTheDocument();
  });

  it('sorts entries newest-first and falls back to host, then raw src, for the label', async () => {
    vi.spyOn(favourites, 'loadFavourites').mockResolvedValue([
      { ...entry, src: 'https://host.example/', sourcePageUrl: '', time: 2000 },
      { ...entry, src: 'file:///', sourcePageUrl: '', time: 1000 },
    ]);
    render(<FavouritesPanel onClose={() => {}} />);
    // A URL with no basename labels by host; a URL with no host labels by raw src.
    const labels = (await screen.findAllByText(/host\.example|file:\/\/\//)).map((n) => n.textContent);
    expect(labels).toEqual(['host.example', 'file:///']);
  });
});
