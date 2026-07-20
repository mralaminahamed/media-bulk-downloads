import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageInfo } from '@mbd/core/types';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { HISTORY_KEY } from '@mbd/storage/history';
import { fetchDownloadedOnDisk } from '@/extension/popup/utils';

export interface UseDownloadHistoryResult {
  downloadedSrcs: SrcKeySet;
  isDownloaded: (item: ImageInfo) => boolean;
}

/**
 * Tracks which images are already downloaded, reconciled against files still
 * on disk (not just download history) — see the effect below for why.
 */
export function useDownloadHistory(): UseDownloadHistoryResult {
  const [downloadedSrcs, setDownloadedSrcs] = useState<SrcKeySet>(new SrcKeySet());
  const downloadedRef = useRef<SrcKeySet>(downloadedSrcs);
  const isDownloaded = useCallback((item: ImageInfo) => downloadedRef.current.has(item.src), []);
  useEffect(() => {
    downloadedRef.current = downloadedSrcs;
  }, [downloadedSrcs]);

  useEffect(() => {
    const refresh = (): void => void fetchDownloadedOnDisk().then((s) => setDownloadedSrcs(SrcKeySet.from(s)));
    refresh();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[HISTORY_KEY]) refresh();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  return { downloadedSrcs, isDownloaded };
}
