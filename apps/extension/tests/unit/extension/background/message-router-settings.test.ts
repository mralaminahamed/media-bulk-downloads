import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

/**
 * The content-script bubble can't read chrome.storage.sync on Safari, so it asks
 * the background for settings (GET_SETTINGS) and the background pushes changes
 * (SETTINGS_CHANGED) after every write. These test both halves of that contract.
 */
const { MOCK } = vi.hoisted(() => ({
  MOCK: { bubbleEnabled: true, bubblePosition: { corner: 'bottom-right', x: 20, y: 20 } },
}));

vi.mock('@/extension/background/state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/extension/background/state')>()),
  currentSettings: MOCK,
  settingsReady: Promise.resolve(),
  writeSettingsPatch: vi.fn(() => Promise.resolve(MOCK)),
}));

import { messageRouter } from '@/extension/background/message-router';
import { writeSettingsPatch } from '@/extension/background/state';

const flush = () => new Promise((r) => setTimeout(r, 0));
const sender = {} as chrome.runtime.MessageSender;

describe('GET_SETTINGS router handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('responds with the background currentSettings (content scripts cannot read storage.sync on Safari)', async () => {
    const respond = vi.fn();
    const ret = messageRouter.GET_SETTINGS!({ type: 'GET_SETTINGS' }, sender, respond);
    expect(ret).toBe(true);
    await flush();
    expect(respond).toHaveBeenCalledWith(MOCK);
  });
});

describe('SET_SETTINGS router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.tabs as unknown as { query: Mock }).query = vi.fn(
      (_q: unknown, cb: (tabs: { id: number }[]) => void) => cb([{ id: 1 }, { id: 2 }]),
    );
    (chrome.tabs.sendMessage as Mock).mockReturnValue(Promise.resolve());
  });

  it('writes the patch through the single serialized writer', () => {
    messageRouter.SET_SETTINGS!({ type: 'SET_SETTINGS', patch: { bubbleEnabled: true } }, sender, vi.fn());
    expect(writeSettingsPatch).toHaveBeenCalledWith({ bubbleEnabled: true });
  });

  it('pushes SETTINGS_CHANGED with the merged settings to every tab', async () => {
    messageRouter.SET_SETTINGS!({ type: 'SET_SETTINGS', patch: { bubbleEnabled: true } }, sender, vi.fn());
    await flush();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'SETTINGS_CHANGED', settings: MOCK });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'SETTINGS_CHANGED', settings: MOCK });
  });
});
