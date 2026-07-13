import { Dispatch, SetStateAction, useState } from 'react';
import { ImageInfo } from '@mbd/core/types';
import { isPendingOrStream } from '@mbd/core/collection/filters';
import { downloadable } from '../lib/appHelpers';

export interface UseSelectionResult {
  selectedSrcs: Set<string>;
  setSelectedSrcs: Dispatch<SetStateAction<Set<string>>>;
  handleToggleSelect: (image: ImageInfo) => void;
  handleSelectRange: (imgs: ImageInfo[]) => void;
  handleSelectAllShown: (shown: ImageInfo[]) => void;
  handleClearSelection: () => void;
}

/**
 * Selective bulk download: srcs the user has ticked. Scoped to what's shown —
 * pruned whenever the filtered view changes (that prune effect stays in App,
 * since it depends on `state.filteredImages`, still owned by the scan/
 * resolution engine). `setSelectedSrcs` is exposed for that effect and for
 * the download-of-selection handlers (still in App) that clear it.
 *
 * `handleSelectAllShown` takes the currently-shown list as an argument
 * rather than reading `state` directly, since `state` isn't owned by this
 * hook.
 */
export function useSelection(): UseSelectionResult {
  const [selectedSrcs, setSelectedSrcs] = useState<Set<string>>(new Set());

  const handleToggleSelect = (image: ImageInfo): void => {
    if (isPendingOrStream(image)) return; // pending/stream items are captured individually, not bulk-selected
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      if (next.has(image.src)) next.delete(image.src);
      else next.add(image.src);
      return next;
    });
  };

  /** Shift-click: add every downloadable item in the clicked run. */
  const handleSelectRange = (imgs: ImageInfo[]): void => {
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      for (const i of imgs) if (!isPendingOrStream(i)) next.add(i.src);
      return next;
    });
  };

  const handleSelectAllShown = (shown: ImageInfo[]): void =>
    setSelectedSrcs(new Set(downloadable(shown).map((i) => i.src)));

  const handleClearSelection = (): void => setSelectedSrcs(new Set());

  return { selectedSrcs, setSelectedSrcs, handleToggleSelect, handleSelectRange, handleSelectAllShown, handleClearSelection };
}
