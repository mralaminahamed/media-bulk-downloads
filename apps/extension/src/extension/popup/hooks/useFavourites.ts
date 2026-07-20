import { useEffect, useState } from 'react';
import { FavouriteEntry, ImageInfo } from '@mbd/core/types';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { favouriteSrcSet, FAVOURITES_KEY } from '@mbd/storage/favourites';
import { sendRuntimeMessage } from '@/extension/popup/utils';

export interface UseFavouritesResult {
  favouriteSrcs: SrcKeySet;
  handleToggleFavourite: (image: ImageInfo) => Promise<void>;
}

/**
 * Tracks the favourited set (loaded on mount, reloaded on a local
 * FAVOURITES_KEY storage change) and toggles membership, mirroring the
 * change optimistically before the background's write round-trips back
 * through storage.onChanged.
 *
 * `currentSourcePage` is owned by App (it depends on `surface`), so it's
 * threaded in rather than duplicated here.
 */
export function useFavourites(
  currentSourcePage: () => Promise<{ url: string; title?: string }>,
): UseFavouritesResult {
  const [favouriteSrcs, setFavouriteSrcs] = useState<SrcKeySet>(new SrcKeySet());

  useEffect(() => {
    void favouriteSrcSet().then(setFavouriteSrcs);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[FAVOURITES_KEY]) void favouriteSrcSet().then(setFavouriteSrcs);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const handleToggleFavourite = async (image: ImageInfo): Promise<void> => {
    if (favouriteSrcs.has(image.src)) {
      sendRuntimeMessage({ type: 'REMOVE_FAVOURITE', src: image.src });
      setFavouriteSrcs((prev) => prev.withoutSrc(image.src));
      return;
    }
    const sourcePage = await currentSourcePage();
    const entry: FavouriteEntry = {
      src: image.src,
      kind: image.kind,
      type: image.type,
      sourcePageUrl: sourcePage.url,
      time: Date.now(),
      ...(image.thumbnailSrc ?? image.poster ? { thumbnailSrc: image.thumbnailSrc ?? image.poster } : {}),
      ...(sourcePage.title ? { sourcePageTitle: sourcePage.title } : {}),
    };
    sendRuntimeMessage({ type: 'ADD_FAVOURITE', entry });
    setFavouriteSrcs((prev) => prev.withAdded(image.src));
  };

  return { favouriteSrcs, handleToggleFavourite };
}
