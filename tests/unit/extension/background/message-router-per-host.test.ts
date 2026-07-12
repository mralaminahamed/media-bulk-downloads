import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/extension/shared/storage/per-host-settings', () => ({
  savePerHostSettings: vi.fn(() => Promise.resolve()),
  clearPerHostSettings: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/extension/shared/storage/per-host-scan-memory', () => ({
  clearScanMemoryForHost: vi.fn(() => Promise.resolve()),
  saveScanMemoryForHost: vi.fn(() => Promise.resolve()),
}));

import { messageRouter } from '@/extension/background/message-router';
import { savePerHostSettings, clearPerHostSettings } from '@/extension/shared/storage/per-host-settings';
import { clearScanMemoryForHost, saveScanMemoryForHost } from '@/extension/shared/storage/per-host-scan-memory';

describe('SET_PER_HOST_SETTINGS router handler', () => {
  const noop = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('a non-null patch saves the host override', () => {
    messageRouter.SET_PER_HOST_SETTINGS!(
      { type: 'SET_PER_HOST_SETTINGS', host: 'booru.example', patch: { minimumImageSize: 1024 } },
      {} as chrome.runtime.MessageSender, noop,
    );
    expect(savePerHostSettings).toHaveBeenCalledWith('booru.example', { minimumImageSize: 1024 });
    expect(clearPerHostSettings).not.toHaveBeenCalled();
  });

  it('a null patch clears the host override (Reset this site)', () => {
    messageRouter.SET_PER_HOST_SETTINGS!(
      { type: 'SET_PER_HOST_SETTINGS', host: 'booru.example', patch: null },
      {} as chrome.runtime.MessageSender, noop,
    );
    expect(clearPerHostSettings).toHaveBeenCalledWith('booru.example');
    expect(savePerHostSettings).not.toHaveBeenCalled();
  });

  it('a null patch also clears the host learned scan memory (#293 phase-2)', () => {
    messageRouter.SET_PER_HOST_SETTINGS!(
      { type: 'SET_PER_HOST_SETTINGS', host: 'booru.example', patch: null },
      {} as chrome.runtime.MessageSender, noop,
    );
    expect(clearScanMemoryForHost).toHaveBeenCalledWith('booru.example');
  });

  it('a non-null patch does not touch the host learned scan memory', () => {
    messageRouter.SET_PER_HOST_SETTINGS!(
      { type: 'SET_PER_HOST_SETTINGS', host: 'booru.example', patch: { minimumImageSize: 1024 } },
      {} as chrome.runtime.MessageSender, noop,
    );
    expect(clearScanMemoryForHost).not.toHaveBeenCalled();
  });
});

describe('SAVE_SCAN_MEMORY router handler', () => {
  const noop = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('persists the host sample via the single serialized writer (#293 phase-2, NEW-1)', () => {
    messageRouter.SAVE_SCAN_MEMORY!(
      { type: 'SAVE_SCAN_MEMORY', host: 'booru.example', sample: { settleMs: 500, scrolls: 12 } },
      {} as chrome.runtime.MessageSender, noop,
    );
    expect(saveScanMemoryForHost).toHaveBeenCalledWith('booru.example', { settleMs: 500, scrolls: 12 });
  });
});
