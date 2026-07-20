import type { Mock } from 'vitest';
import { downloadedOnDiskKeys } from '@/extension/background/download/downloaded-keys';
import * as history from '@mbd/storage/history';

describe('downloadedOnDiskKeys', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns canonical keys of history entries whose file still exists', async () => {
    vi.spyOn(history, 'loadHistory').mockResolvedValue([
      { src: 'https://x/a.png', downloadId: 1 },
      { src: 'https://x/b.png', downloadId: 2 },
    ] as never);
    (chrome.downloads.search as unknown as Mock).mockResolvedValue([
      { id: 1, exists: true },
      { id: 2, exists: false }, // deleted from disk
    ]);
    const keys = await downloadedOnDiskKeys();
    expect(keys.has('https://x/a.png')).toBe(true);
    expect(keys.has('https://x/b.png')).toBe(false);
  });

  it('degrades to an empty set when the download search throws', async () => {
    vi.spyOn(history, 'loadHistory').mockResolvedValue([{ src: 'https://x/a.png', downloadId: 1 }] as never);
    (chrome.downloads.search as unknown as Mock).mockRejectedValue(new Error('boom'));
    const keys = await downloadedOnDiskKeys();
    expect(keys.has('https://x/a.png')).toBe(false);
    expect(keys.size).toBe(0);
  });
});
