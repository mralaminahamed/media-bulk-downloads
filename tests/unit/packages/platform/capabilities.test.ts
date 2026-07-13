import { describe, it, expect, afterEach } from 'vitest';
import { detectCapabilities } from '@mbd/platform/capabilities';

describe('detectCapabilities', () => {
  const original = (globalThis as { chrome?: unknown }).chrome;
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = original;
  });

  it('reports every capability present when all APIs exist', () => {
    (globalThis as { chrome?: unknown }).chrome = {
      downloads: {},
      offscreen: {},
      notifications: {},
      declarativeNetRequest: {},
    };
    expect(detectCapabilities()).toEqual({
      hasDownloadsApi: true,
      hasOffscreen: true,
      hasNotifications: true,
      hasHeaderRules: true,
    });
  });

  it('reports a Safari-like target (no downloads/offscreen/notifications)', () => {
    (globalThis as { chrome?: unknown }).chrome = {
      declarativeNetRequest: {},
    };
    expect(detectCapabilities()).toEqual({
      hasDownloadsApi: false,
      hasOffscreen: false,
      hasNotifications: false,
      hasHeaderRules: true,
    });
  });

  it('reports all-false when no extension global is present', () => {
    (globalThis as { chrome?: unknown; browser?: unknown }).chrome = undefined;
    (globalThis as { chrome?: unknown; browser?: unknown }).browser = undefined;
    expect(detectCapabilities()).toEqual({
      hasDownloadsApi: false,
      hasOffscreen: false,
      hasNotifications: false,
      hasHeaderRules: false,
    });
  });
});
