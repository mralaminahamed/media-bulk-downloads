/**
 * Verifies the content script mounts/unmounts the bubble from storage-driven
 * settings. The heavy bubble module is mocked so we don't load React here.
 */
jest.mock('@/extension/bubble/mount', () => ({
  mountBubble: jest.fn(() => ({ unmount: jest.fn() })),
}));

import { mountBubble } from '@/extension/bubble/mount';
import '@/extension/content';

const onChanged = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];
const flush = () => new Promise((r) => setTimeout(r, 0));

const settings = (bubbleEnabled: boolean) => ({
  settings: { newValue: { bubbleEnabled, bubblePosition: { corner: 'bottom-right', x: 20, y: 20 } } },
});

describe('content bubble lifecycle', () => {
  beforeEach(async () => {
    // Reset to unmounted between tests (module state persists).
    onChanged(settings(false), 'sync');
    await flush();
    (mountBubble as jest.Mock).mockClear();
  });

  it('mounts the bubble when enabled', async () => {
    onChanged(settings(true), 'sync');
    await flush();
    expect(mountBubble).toHaveBeenCalledTimes(1);
  });

  it('does not mount twice while already mounted', async () => {
    onChanged(settings(true), 'sync');
    await flush();
    onChanged(settings(true), 'sync');
    await flush();
    expect(mountBubble).toHaveBeenCalledTimes(1);
  });

  it('unmounts the bubble when disabled', async () => {
    onChanged(settings(true), 'sync');
    await flush();
    const controller = (mountBubble as jest.Mock).mock.results[0].value;

    onChanged(settings(false), 'sync');
    await flush();
    expect(controller.unmount).toHaveBeenCalled();
  });

  it('ignores changes in other storage areas', async () => {
    onChanged(settings(true), 'local');
    await flush();
    expect(mountBubble).not.toHaveBeenCalled();
  });
});
