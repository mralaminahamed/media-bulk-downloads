import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/extension/shared/storage/per-host-settings', () => ({
  savePerHostSettings: vi.fn(() => Promise.resolve()),
  clearPerHostSettings: vi.fn(() => Promise.resolve()),
}));

import { messageRouter } from '@/extension/background/message-router';
import { savePerHostSettings, clearPerHostSettings } from '@/extension/shared/storage/per-host-settings';

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
});
