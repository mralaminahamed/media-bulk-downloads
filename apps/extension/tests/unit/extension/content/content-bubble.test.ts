import type { Mock } from 'vitest';
/**
 * The content script gets settings from the background (GET_SETTINGS) and applies
 * bubble changes pushed to it as SETTINGS_CHANGED. It no longer reads
 * chrome.storage.sync directly — Safari content scripts don't reliably see the
 * popup's sync writes, nor fire storage.onChanged for them, so the bubble would
 * never mount. The heavy bubble module is mocked so we don't load React here.
 */
vi.mock('@/extension/bubble/mount', () => ({
  mountBubble: vi.fn(() => ({ unmount: vi.fn() })),
}));

import { mountBubble } from '@/extension/bubble/mount';

const flush = () => new Promise((r) => setTimeout(r, 0));

const settings = (bubbleEnabled: boolean) => ({
  bubbleEnabled,
  bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
});

// Dispatches a SETTINGS_CHANGED push to the content script's runtime.onMessage
// listeners — the live mount/unmount channel that replaces storage.onChanged.
let pushSettings: (bubbleEnabled: boolean) => void;
let mountedOnLoad = 0;

beforeAll(async () => {
  // The content script's first act is to ask the background for settings. Answer
  // as a page reload would with the bubble already enabled, so we can assert it
  // mounts from that initial response (not only from a live change).
  (chrome.runtime.sendMessage as Mock).mockImplementation(
    (message: unknown, cb?: (s: unknown) => void) => {
      if ((message as { type?: string })?.type === 'GET_SETTINGS' && cb) cb(settings(true));
    },
  );

  await import('@/extension/content');
  await flush();
  mountedOnLoad = (mountBubble as Mock).mock.calls.length;

  const listeners = (chrome.runtime.onMessage.addListener as Mock).mock.calls.map((c) => c[0]);
  pushSettings = (bubbleEnabled) =>
    listeners.forEach((l) => l({ type: 'SETTINGS_CHANGED', settings: settings(bubbleEnabled) }));
});

describe('content bubble lifecycle (message-driven)', () => {
  beforeEach(async () => {
    pushSettings(false); // reset to unmounted (module state persists across tests)
    await flush();
    (mountBubble as Mock).mockClear();
  });

  it('asks the background for settings on load (not storage.sync)', () => {
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'GET_SETTINGS' },
      expect.any(Function),
    );
  });

  it('mounts from the initial GET_SETTINGS response when enabled', () => {
    expect(mountedOnLoad).toBe(1);
  });

  it('mounts the bubble when a SETTINGS_CHANGED push enables it', async () => {
    pushSettings(true);
    await flush();
    expect(mountBubble).toHaveBeenCalledTimes(1);
  });

  it('does not mount twice while already mounted', async () => {
    pushSettings(true);
    await flush();
    pushSettings(true);
    await flush();
    expect(mountBubble).toHaveBeenCalledTimes(1);
  });

  it('unmounts the bubble when disabled', async () => {
    pushSettings(true);
    await flush();
    const controller = (mountBubble as Mock).mock.results[0].value;

    pushSettings(false);
    await flush();
    expect(controller.unmount).toHaveBeenCalled();
  });

  it('does not mount when a disable races in during the bubble chunk import', async () => {
    // enable() suspends mountBubble at `await import(...)`; a disable arriving
    // before the import resolves must cancel the pending mount (desired-state
    // guard), not leave the bubble mounted against the disabled setting.
    pushSettings(true);
    pushSettings(false);
    await flush();
    expect(mountBubble).not.toHaveBeenCalled();
  });

  it('ignores unrelated runtime messages', async () => {
    const listeners = (chrome.runtime.onMessage.addListener as Mock).mock.calls.map((c) => c[0]);
    listeners.forEach((l) => l({ type: 'NOT_SETTINGS' }));
    await flush();
    expect(mountBubble).not.toHaveBeenCalled();
  });
});
