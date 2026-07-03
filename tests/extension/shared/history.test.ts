import { mergeHistory, recordDownloads, removeEntry, clearHistory, downloadedSrcSet, HISTORY_CAP } from '@/extension/shared/history';
import { HistoryEntry } from '@/types';

const e = (src: string, time: number): HistoryEntry =>
  ({ src, filename: `${src}.jpg`, kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });

describe('mergeHistory', () => {
  it('dedups by src, newest wins and moves to front', () => {
    const out = mergeHistory([e('a', 1), e('b', 2)], [e('a', 5)]);
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out[0].time).toBe(5);
  });
  it('sorts newest-first and caps at HISTORY_CAP', () => {
    const many = Array.from({ length: HISTORY_CAP + 10 }, (_, i) => e(`s${i}`, i));
    const out = mergeHistory(many, []);
    expect(out).toHaveLength(HISTORY_CAP);
    expect(out[0].time).toBe(HISTORY_CAP + 9); // newest
  });
});

describe('storage helpers', () => {
  beforeEach(() => {
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ downloadHistory: [e('a', 1)] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  });
  it('recordDownloads merges and writes', async () => {
    await recordDownloads([e('b', 2)]);
    const written = (chrome.storage.local.set as jest.Mock).mock.calls[0][0].downloadHistory;
    expect(written.map((x: HistoryEntry) => x.src).sort()).toEqual(['a', 'b']);
  });
  it('removeEntry drops the matching src', async () => {
    await removeEntry('a');
    expect((chrome.storage.local.set as jest.Mock).mock.calls[0][0].downloadHistory).toEqual([]);
  });
  it('clearHistory writes an empty array', async () => {
    await clearHistory();
    expect((chrome.storage.local.set as jest.Mock).mock.calls[0][0].downloadHistory).toEqual([]);
  });
  it('downloadedSrcSet returns the unique srcs', async () => {
    expect(await downloadedSrcSet()).toEqual(new Set(['a']));
  });
  it('serializes concurrent recordDownloads without dropping entries', async () => {
    let store: HistoryEntry[] = [];
    (chrome.storage.local.get as jest.Mock).mockReset().mockImplementation(async () => ({ downloadHistory: store }));
    (chrome.storage.local.set as jest.Mock)
      .mockReset()
      .mockImplementation(async (obj: Record<string, HistoryEntry[]>) => {
        store = obj.downloadHistory;
      });
    await Promise.all([recordDownloads([e('a', 1)]), recordDownloads([e('b', 2)])]);
    expect(store.map((x) => x.src).sort()).toEqual(['a', 'b']);
  });
});
