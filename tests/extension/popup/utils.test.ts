import {
  getImageFileSize,
  mapWithConcurrency,
  sendRuntimeMessage,
  copyText,
  downloadText,
  fetchDownloadedOnDisk,
  relativeTime,
} from '@/extension/popup/utils';

describe('utils', () => {
  describe('getImageFileSize', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns the Content-Length reported by a HEAD request', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        headers: { get: jest.fn().mockReturnValue('2048') },
      }) as unknown as typeof fetch;

      await expect(getImageFileSize('https://example.com/a.png')).resolves.toBe(2048);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/a.png', { method: 'HEAD' });
    });

    it('returns 0 when Content-Length is missing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        headers: { get: jest.fn().mockReturnValue(null) },
      }) as unknown as typeof fetch;

      await expect(getImageFileSize('https://example.com/a.png')).resolves.toBe(0);
    });

    it('returns 0 when the request fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;

      await expect(getImageFileSize('https://example.com/a.png')).resolves.toBe(0);
    });

    it('returns 0 when Content-Length is non-numeric', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        headers: { get: jest.fn().mockReturnValue('not-a-number') },
      }) as unknown as typeof fetch;

      await expect(getImageFileSize('https://example.com/a.png')).resolves.toBe(0);
    });

    it('parses a numeric Content-Length with surrounding whitespace', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        headers: { get: jest.fn().mockReturnValue('  4096  ') },
      }) as unknown as typeof fetch;

      await expect(getImageFileSize('https://example.com/a.png')).resolves.toBe(4096);
    });
  });

  describe('mapWithConcurrency', () => {
    it('maps all items, preserving input order', async () => {
      const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
      expect(result).toEqual([10, 20, 30, 40]);
    });

    it('never runs more than `limit` tasks at once', async () => {
      let active = 0;
      let maxActive = 0;

      await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return null;
      });

      expect(maxActive).toBeLessThanOrEqual(3);
    });

    it('handles an empty list', async () => {
      await expect(mapWithConcurrency([], 4, async (x) => x)).resolves.toEqual([]);
    });

    it('treats a limit larger than the list as no cap', async () => {
      const result = await mapWithConcurrency([1, 2], 100, async (n) => n + 1);
      expect(result).toEqual([2, 3]);
    });

    it('coerces a zero/negative limit up to at least one worker', async () => {
      await expect(mapWithConcurrency([1, 2, 3], 0, async (n) => n)).resolves.toEqual([1, 2, 3]);
    });

    it('propagates a rejection from the mapper', async () => {
      await expect(
        mapWithConcurrency([1, 2, 3], 2, async (n) => {
          if (n === 2) throw new Error('boom');
          return n;
        }),
      ).rejects.toThrow('boom');
    });

    it('maps a large list correctly under a small concurrency cap', async () => {
      const items = Array.from({ length: 50 }, (_, i) => i);
      const result = await mapWithConcurrency(items, 4, async (n) => n * 2);
      expect(result).toEqual(items.map((n) => n * 2));
    });
  });

  describe('sendRuntimeMessage', () => {
    const send = chrome.runtime.sendMessage as jest.Mock;
    afterEach(() => send.mockReset());

    it('swallows a rejected promise (no receiver) without throwing', () => {
      send.mockReturnValue(Promise.reject(new Error('no receiver')));
      expect(() => sendRuntimeMessage({ type: 'X' })).not.toThrow();
    });

    it('tolerates a void return (mock/env with no promise)', () => {
      send.mockReturnValue(undefined);
      expect(() => sendRuntimeMessage({ type: 'X' })).not.toThrow();
    });
  });

  describe('copyText', () => {
    it('returns true when the clipboard write succeeds', async () => {
      Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
      await expect(copyText('hi')).resolves.toBe(true);
    });

    it('returns false when the clipboard is blocked', async () => {
      Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('blocked')) } });
      await expect(copyText('hi')).resolves.toBe(false);
    });
  });

  describe('downloadText', () => {
    it('routes a DOWNLOAD_TEXT message through the background', () => {
      const send = chrome.runtime.sendMessage as jest.Mock;
      send.mockReset().mockReturnValue(undefined);
      downloadText('links.txt', 'a\nb', 'text/plain');
      expect(send).toHaveBeenCalledWith({ type: 'DOWNLOAD_TEXT', filename: 'links.txt', text: 'a\nb', mime: 'text/plain' });
    });

    it('defaults the mime to text/plain', () => {
      const send = chrome.runtime.sendMessage as jest.Mock;
      send.mockReset().mockReturnValue(undefined);
      downloadText('x.txt', 'y');
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ mime: 'text/plain' }));
    });
  });

  describe('fetchDownloadedOnDisk', () => {
    const send = chrome.runtime.sendMessage as jest.Mock;
    beforeEach(() => {
      send.mockReset();
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });

    it('resolves the returned srcs as a Set', async () => {
      send.mockImplementation((_msg, cb) => cb(['https://x/a', 'https://x/b']));
      await expect(fetchDownloadedOnDisk()).resolves.toEqual(new Set(['https://x/a', 'https://x/b']));
    });

    it('resolves an empty set when the worker gives a non-array / no answer', async () => {
      send.mockImplementation((_msg, cb) => cb(undefined));
      await expect(fetchDownloadedOnDisk()).resolves.toEqual(new Set());
    });

    it('resolves an empty set when sendMessage throws', async () => {
      send.mockImplementation(() => { throw new Error('context invalidated'); });
      await expect(fetchDownloadedOnDisk()).resolves.toEqual(new Set());
    });
  });

  describe('relativeTime', () => {
    it('formats each bucket boundary', () => {
      const now = Date.now();
      expect(relativeTime(now)).toBe('now');
      expect(relativeTime(now - 90_000)).toBe('1m');
      expect(relativeTime(now - 3 * 3600_000)).toBe('3h');
      expect(relativeTime(now - 2 * 86400_000)).toBe('2d');
      // beyond a week → an absolute date (not one of the compact tokens)
      expect(relativeTime(now - 10 * 86400_000)).not.toMatch(/^(now|\d+[mhd])$/);
    });

    it('clamps a future timestamp to "now"', () => {
      expect(relativeTime(Date.now() + 60_000)).toBe('now');
    });
  });
});
