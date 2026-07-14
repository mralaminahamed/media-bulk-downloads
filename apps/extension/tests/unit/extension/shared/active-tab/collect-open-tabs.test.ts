import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { collectOpenTabs, listOpenTabs } from '@/extension/shared/active-tab/collect-open-tabs';
import { ImageInfo } from '@mbd/core/types';

const image = (src: string): ImageInfo => ({
  src,
  alt: '',
  width: 100,
  height: 100,
  type: 'jpeg',
  fileSize: 0,
  isBase64: false,
  kind: 'image',
});

// Per-tab scripted behaviour: return images, fail (lastError), or hang (no reply).
type Behaviour = { images: ImageInfo[] } | 'fail' | 'hang';

function mockTabs(tabs: chrome.tabs.Tab[], behaviour: Record<number, Behaviour>): void {
  (chrome.tabs.query as Mock).mockResolvedValue(tabs);
  (chrome.tabs.sendMessage as Mock).mockImplementation((id: number, _msg: unknown, cb: (r: unknown) => void) => {
    const b = behaviour[id];
    if (b === 'hang') return; // never calls back → exercises the per-tab timeout
    if (b === 'fail') {
      (chrome.runtime as { lastError?: unknown }).lastError = { message: 'Receiving end does not exist' };
      cb(undefined);
      (chrome.runtime as { lastError?: unknown }).lastError = undefined;
      return;
    }
    (chrome.runtime as { lastError?: unknown }).lastError = undefined;
    cb(b?.images ?? []);
  });
}

const tab = (id: number, url: string, extra: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab =>
  ({ id, url, title: `Tab ${id}`, ...extra }) as chrome.tabs.Tab;

beforeEach(() => {
  (chrome.runtime as { lastError?: unknown }).lastError = undefined;
});

describe('collectOpenTabs', () => {
  it('tags each item with its source tab and reports scanned/skipped', async () => {
    mockTabs(
      [
        tab(1, 'https://a.com/1'),
        tab(2, 'https://b.com/2'),
        tab(3, 'chrome://extensions'), // ineligible scheme
        tab(4, 'https://c.com', { discarded: true }), // ineligible (unloaded)
        tab(5, 'https://d.com'), // eligible but the send fails
      ],
      {
        1: { images: [image('https://a.com/x.jpg')] },
        2: { images: [image('https://b.com/y.jpg')] },
        5: 'fail',
      },
    );

    const { items, scanned, skipped } = await collectOpenTabs();

    expect(scanned).toBe(2); // tabs 1 & 2 returned media
    expect(skipped).toBe(3); // 2 ineligible (chrome://, discarded) + 1 failed send
    expect(items.map((i) => i.src).sort()).toEqual(['https://a.com/x.jpg', 'https://b.com/y.jpg']);
    const a = items.find((i) => i.src.includes('a.com'));
    expect(a?.sourcePage).toEqual({ url: 'https://a.com/1', title: 'Tab 1' });
  });

  it('de-duplicates the same canonical image across tabs, keeping the largest', async () => {
    const small = { ...image('https://cdn/x.jpg?token=A'), width: 320, height: 240 };
    const large = { ...image('https://cdn/x.jpg?token=B'), width: 2048, height: 1536 };
    mockTabs([tab(1, 'https://a.com'), tab(2, 'https://b.com')], {
      1: { images: [small] },
      2: { images: [large] },
    });

    const { items } = await collectOpenTabs();
    expect(items).toHaveLength(1);
    expect(items[0].width).toBe(2048);
    expect(items[0].sourcePage?.url).toBe('https://b.com'); // kept copy keeps its tab
  });

  it('restricts to the given tabIds and does not count unrequested tabs as skipped', async () => {
    mockTabs([tab(1, 'https://a.com'), tab(2, 'https://b.com'), tab(3, 'https://c.com')], {
      1: { images: [image('https://a.com/x.jpg')] },
      2: { images: [image('https://b.com/y.jpg')] },
      3: { images: [image('https://c.com/z.jpg')] },
    });

    const { items, scanned, skipped } = await collectOpenTabs({ tabIds: [1] });
    expect(scanned).toBe(1);
    expect(skipped).toBe(0);
    expect(items.map((i) => i.src)).toEqual(['https://a.com/x.jpg']);
  });

  it('reports per-tab progress', async () => {
    mockTabs([tab(1, 'https://a.com'), tab(2, 'https://b.com')], {
      1: { images: [] },
      2: { images: [] },
    });
    const seen: Array<[number, number]> = [];
    await collectOpenTabs({ onProgress: (done, total) => seen.push([done, total]) });
    expect(seen).toContainEqual([2, 2]); // final progress reaches total
  });

  it('skips a tab that never responds, after the per-tab timeout', async () => {
    vi.useFakeTimers();
    try {
      mockTabs([tab(1, 'https://a.com'), tab(2, 'https://b.com')], {
        1: { images: [image('https://a.com/x.jpg')] },
        2: 'hang', // never replies
      });
      const promise = collectOpenTabs();
      await vi.advanceTimersByTimeAsync(8000); // trip the timeout for tab 2
      const { scanned, skipped, items } = await promise;
      expect(scanned).toBe(1);
      expect(skipped).toBe(1);
      expect(items.map((i) => i.src)).toEqual(['https://a.com/x.jpg']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('listOpenTabs', () => {
  it('returns only eligible http(s) tabs with a display title', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([
      tab(1, 'https://a.com/page', { favIconUrl: 'https://a.com/fav.ico' }),
      tab(2, 'chrome://settings'),
      tab(3, 'https://b.com', { title: '' }), // blank title → falls back to url
    ]);
    const list = await listOpenTabs();
    expect(list.map((t) => t.id)).toEqual([1, 3]);
    expect(list[0].favIconUrl).toBe('https://a.com/fav.ico');
    expect(list[1].title).toBe('https://b.com'); // blank title → url
  });
});
