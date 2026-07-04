import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FavouritesPanel from '@/extension/popup/components/FavouritesPanel';
import * as favourites from '@/extension/shared/favourites';

const entry = {
  src: 'https://c/a.jpg', kind: 'image' as const, type: 'jpeg',
  sourcePageUrl: 'https://page.example', time: Date.now(),
};

describe('FavouritesPanel', () => {
  beforeEach(() => {
    jest.spyOn(favourites, 'loadFavourites').mockResolvedValue([entry]);
    (chrome.runtime.sendMessage as jest.Mock).mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists entries and clears all via the background', async () => {
    render(<FavouritesPanel onClose={() => {}} />);
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
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
    jest.spyOn(favourites, 'loadFavourites').mockResolvedValue([
      { ...entry, src: 'data:image/png;base64,AAAABBBBCCCCDDDD' },
    ]);
    render(<FavouritesPanel onClose={() => {}} />);
    expect(await screen.findByText('Embedded image')).toBeInTheDocument();
  });
});
