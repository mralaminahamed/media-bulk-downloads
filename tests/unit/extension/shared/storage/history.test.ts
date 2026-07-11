import type { Mock } from 'vitest';
import { mergeHistory, recordDownloads, removeEntry, clearHistory, restoreHistory, srcsStillOnDisk, loadHistory, HISTORY_CAP, HISTORY_MAX_BYTES } from '@/extension/shared/storage/history';
import { HistoryEntry } from '@/types';

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
    // dedup by src (a wins at time 9), sorted newest-first — old contents dropped.
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
    expect(onDisk).toEqual(['a']); // 20 positively deleted
  });

  it('drops an entry only when the browser positively reports it deleted', () => {
    const history = [withId('a', 10), withId('b', 20)];
    expect(srcsStillOnDisk(history, () => 'deleted')).toEqual([]);
  });

  it('KEEPS an entry whose download id is unknown to the browser (cleared Chrome history)', () => {
    // regression guard: the bug dropped these, showing on-disk files as "not downloaded"
    const history = [withId('a', 10), withId('b', 20)];
    expect(srcsStillOnDisk(history, () => 'unknown')).toEqual(['a', 'b']);
  });

  it('keeps legacy entries with no downloadId regardless of state', () => {
    const history = [withId('a'), withId('b', 20)];
    expect(srcsStillOnDisk(history, () => 'deleted')).toEqual(['a']);
  });
});
