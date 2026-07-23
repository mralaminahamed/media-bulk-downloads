import type { Mock } from 'vitest';
import { recordDownloads, removeEntry, clearHistory, restoreHistory, srcsStillOnDisk, loadHistory } from '@mbd/storage/history';
import { HistoryEntry } from '@mbd/core/types';
import { idbGet } from '@mbd/storage/idb';

describe('loadHistory — corrupt storage', () => {
  it('drops entries without a string src and coerces a bad time to 0', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({
      downloadHistory: [{ src: 'a', time: 5 }, { filename: 'no-src' }, { src: 'b' }, 'garbage', null],
    });
    const out = await loadHistory();
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out.find((x) => x.src === 'b')!.time).toBe(0);
  });
});

const e = (src: string, time: number): HistoryEntry =>
  ({ src, filename: `${src}.jpg`, kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });

describe('storage helpers', () => {
  beforeEach(() => {
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ downloadHistory: [e('a', 1)] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
  });
  it('recordDownloads merges and writes', async () => {
    await recordDownloads([e('b', 2)]);
    const written = (chrome.storage.local.set as Mock).mock.calls[0][0].downloadHistory;
    expect(written.map((x: HistoryEntry) => x.src).sort()).toEqual(['a', 'b']);
  });
  it('removeEntry drops the matching src', async () => {
    await removeEntry('a');
    expect((chrome.storage.local.set as Mock).mock.calls[0][0].downloadHistory).toEqual([]);
  });
  it('clearHistory writes an empty array', async () => {
    await clearHistory();
    expect((chrome.storage.local.set as Mock).mock.calls[0][0].downloadHistory).toEqual([]);
  });
  it('serializes concurrent recordDownloads without dropping entries', async () => {
    let store: HistoryEntry[] = [];
    (chrome.storage.local.get as Mock).mockReset().mockImplementation(async () => ({ downloadHistory: store }));
    (chrome.storage.local.set as Mock)
      .mockReset()
      .mockImplementation(async (obj: Record<string, HistoryEntry[]>) => {
        store = obj.downloadHistory;
      });
    await Promise.all([recordDownloads([e('a', 1)]), recordDownloads([e('b', 2)])]);
    expect(store.map((x) => x.src).sort()).toEqual(['a', 'b']);
  });
});

describe('restoreHistory', () => {
  it('replaces history with the normalized imported list (dedup + newest-first)', async () => {
    let store: HistoryEntry[] = [];
    (chrome.storage.local.set as Mock).mockReset().mockImplementation(async (obj: Record<string, HistoryEntry[]>) => {
      store = obj.downloadHistory;
    });
    await restoreHistory([e('a', 1), e('b', 3), e('a', 9)]);
    expect(store.map((x) => x.src)).toEqual(['a', 'b']);
    expect(store[0].time).toBe(9);
  });
});

describe('srcsStillOnDisk', () => {
  const withId = (src: string, downloadId?: number) =>
    ({ src, filename: src, kind: 'image', type: 'jpeg', sourcePageUrl: '', time: 1, downloadId }) as HistoryEntry;

  it('keeps entries whose file the browser reports as existing', () => {
    const history = [withId('a', 10), withId('b', 20)];
    const onDisk = srcsStillOnDisk(history, (id) => (id === 10 ? 'exists' : 'deleted'));
    expect(onDisk).toEqual(['a']);
  });

  it('drops an entry only when the browser positively reports it deleted', () => {
    const history = [withId('a', 10), withId('b', 20)];
    expect(srcsStillOnDisk(history, () => 'deleted')).toEqual([]);
  });

  it('KEEPS an entry whose download id is unknown to the browser (cleared Chrome history)', () => {
    const history = [withId('a', 10), withId('b', 20)];
    expect(srcsStillOnDisk(history, () => 'unknown')).toEqual(['a', 'b']);
  });

  it('keeps legacy entries with no downloadId regardless of state', () => {
    const history = [withId('a'), withId('b', 20)];
    expect(srcsStillOnDisk(history, () => 'deleted')).toEqual(['a']);
  });
});

describe('history writes mirror to IDB', () => {
  it('recordDownloads lands the entry in local AND the IDB mirror', async () => {
    (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await recordDownloads([{ src: 'z', filename: 'z', kind: 'image', type: 'jpeg', sourcePageUrl: '', time: 5 } as HistoryEntry]);
    await new Promise((r) => setTimeout(r, 0));
    const mirrored = await idbGet<HistoryEntry[]>('downloadHistory');
    expect(mirrored?.some((e) => e.src === 'z')).toBe(true);
  });
});
