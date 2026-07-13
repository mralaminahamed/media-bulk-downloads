/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://x.com/home" }
 *
 * The MAIN-world X/Twitter media relay in src/extension/content/index.ts only
 * wires on x.com / twitter.com hosts, so this file pins jsdom's location to
 * x.com (jsdom's `location` is immutable at runtime — LegacyUnforgeable — so the
 * host has to be fixed per file via `@vitest-environment-options`). It captures
 * the exact window 'message' handlers the content module registers at import and
 * drives them directly, so assertions never depend on listeners left on `window`
 * by an earlier import.
 */
import type { Mock, MockInstance } from 'vitest';

export {}; // isolate this file's top-level bindings to module scope

type Handler = (event: unknown) => void;

const loadContent = async (): Promise<{ messageHandlers: Handler[]; postSpy: MockInstance }> => {
  vi.resetModules();
  const addSpy = vi.spyOn(window, 'addEventListener');
  const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const sendMessage = chrome.runtime.sendMessage as Mock;
  sendMessage.mockReset();
  sendMessage.mockReturnValue(Promise.resolve(undefined));

  await import('@/extension/content');

  const messageHandlers = addSpy.mock.calls
    .filter((c) => c[0] === 'message')
    .map((c) => c[1] as Handler);
  addSpy.mockRestore();
  return { messageHandlers, postSpy };
};

const fire = (handlers: Handler[], event: unknown): void => handlers.forEach((h) => h(event));

// Same-window, same-origin envelope by default; `over` swaps in a foreign field.
const message = (data: unknown, over: { source?: unknown; origin?: string } = {}): unknown => ({
  source: 'source' in over ? over.source : window,
  origin: 'origin' in over ? over.origin : window.location.origin,
  data,
});

describe('X media relay (x.com)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    (chrome.runtime.sendMessage as Mock).mockReset();
    vi.resetModules();
  });

  it('forwards a valid ibd-x-media envelope as X_MEDIA_SEEN', async () => {
    const { messageHandlers } = await loadContent();
    const pairs = [{ poster: 'https://pbs.twimg.com/p.jpg', url: 'https://video.twimg.com/x.mp4' }];
    fire(messageHandlers, message({ source: 'ibd-x-media', pairs }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'X_MEDIA_SEEN', pairs });
  });

  it('wires both the X and HLS relays on x.com', async () => {
    expect((await loadContent()).messageHandlers).toHaveLength(2);
  });

  it('ignores a foreign window source', async () => {
    const { messageHandlers } = await loadContent();
    fire(messageHandlers, message({ source: 'ibd-x-media', pairs: [] }, { source: {} }));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a foreign origin', async () => {
    const { messageHandlers } = await loadContent();
    fire(messageHandlers, message({ source: 'ibd-x-media', pairs: [] }, { origin: 'https://evil.example' }));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a wrong source tag, a non-array pairs, and a null payload', async () => {
    const { messageHandlers } = await loadContent();
    fire(messageHandlers, message({ source: 'ibd-not-x', pairs: [] }));
    fire(messageHandlers, message({ source: 'ibd-x-media', pairs: 'nope' }));
    fire(messageHandlers, message(null));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
