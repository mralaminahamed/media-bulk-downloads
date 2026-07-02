import { getImageFileSize, mapWithConcurrency } from '@/extension/popup/utils';

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
});
