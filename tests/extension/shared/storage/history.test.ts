import { mergeHistory, recordDownloads, removeEntry, clearHistory, restoreHistory, downloadedSrcSet, srcsStillOnDisk, loadHistory, HISTORY_CAP, HISTORY_MAX_BYTES } from '@/extension/shared/storage/history';
import { HistoryEntry } from '@/types';

describe('loadHistory — corrupt storage', () => {
  it('drops entries without a string src and coerces a bad time to 0', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({
      downloadHistory: [{ src: 'a', time: 5 }, { filename: 'no-src' }, { src: 'b' }, 'garbage', null],
    });
    const out = await loadHistory();
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out.find((x) => x.src === 'b')!.time).toBe(0);
  });
});

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
  it('bounds the list by serialized byte budget (big base64-style srcs), newest kept', () => {
    // Each src alone is ~1/3 of the budget, so four entries overflow it.
    const chunk = 'x'.repeat(Math.ceil(HISTORY_MAX_BYTES / 3));
    const big = (id: string, time: number): HistoryEntry =>
      ({ src: `https://p/${id}/${chunk}`, filename: 'f.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });
    const out = mergeHistory([big('a', 1), big('b', 2), big('c', 3), big('d', 4)], []);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.length).toBeLessThan(4); // at least one over-budget entry trimmed
    expect(out[0].time).toBe(4); // newest retained first
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

describe('restoreHistory', () => {
  it('replaces history with the normalized imported list (dedup + newest-first)', async () => {
    let store: HistoryEntry[] = [];
    (chrome.storage.local.set as jest.Mock).mockReset().mockImplementation(async (obj: Record<string, HistoryEntry[]>) => {
      store = obj.downloadHistory;
    });
    await restoreHistory([e('a', 1), e('b', 3), e('a', 9)]);
    // dedup by src (a wins at time 9), sorted newest-first — old contents dropped.
    expect(store.map((x) => x.src)).toEqual(['a', 'b']);
    expect(store[0].time).toBe(9);
  });
});

describe('srcsStillOnDisk', () => {
  const withId = (src: string, downloadId: number): HistoryEntry => ({ ...e(src, 1), downloadId });

  it('keeps only entries whose tracked download still exists on disk', () => {
    const history = [withId('keep', 10), withId('gone', 20)];
    const onDisk = srcsStillOnDisk(history, (id) => id === 10); // 20 was deleted/moved
    expect(onDisk).toEqual(['keep']);
  });

  it('keeps legacy entries without a downloadId (existence cannot be verified)', () => {
    const history = [e('legacy', 1), withId('present', 10)];
    const onDisk = srcsStillOnDisk(history, (id) => id === 10);
    expect(onDisk).toEqual(['legacy', 'present']);
  });

  it('returns nothing when every tracked file is gone', () => {
    expect(srcsStillOnDisk([withId('a', 1), withId('b', 2)], () => false)).toEqual([]);
  });
});
