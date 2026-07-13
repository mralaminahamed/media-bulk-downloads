import type { Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDownloadHistory } from '@/extension/popup/hooks/useDownloadHistory';
import { ImageInfo } from '@mbd/core/types';

const image = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'test.jpg', alt: 'Test', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false, kind: 'image', ...over,
});

describe('useDownloadHistory', () => {
  it('reflects a downloaded src via isDownloaded once the on-disk set resolves', async () => {
    // fetchDownloadedOnDisk() asks the background over GET_DOWNLOADED_SRCS.
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'GET_DOWNLOADED_SRCS' && cb) cb(['https://c/a.jpg']);
    });

    const { result } = renderHook(() => useDownloadHistory());

    await waitFor(() => expect(result.current.downloadedSrcs.has('https://c/a.jpg')).toBe(true));
    expect(result.current.isDownloaded(image({ src: 'https://c/a.jpg' }))).toBe(true);
    expect(result.current.isDownloaded(image({ src: 'https://c/other.jpg' }))).toBe(false);
  });
});
