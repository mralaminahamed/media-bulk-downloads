/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/" }
 *
 * The MAIN-world Facebook media relay in src/extension/content/index.ts only
 * wires on facebook.com hosts, so this file pins jsdom's location to
 * facebook.com (jsdom's `location` is immutable at runtime — LegacyUnforgeable
 * — so the host has to be fixed per file via `@vitest-environment-options`). Only
 * the resolver entry point the relay forwards to is spied on; the rest of the
 * module stays real. Handlers are captured and driven directly so assertions
 * never depend on listeners left on `window` by an earlier import.
 */
import type { Mock } from 'vitest';

vi.mock('@mbd/core/resolvers/sites/facebook', async () => ({
  ...(await vi.importActual<typeof import('@mbd/core/resolvers/sites/facebook')>('@mbd/core/resolvers/sites/facebook')),
  ingestSniffedFbMedia: vi.fn(),
}));

export {}; // isolate this file's top-level bindings to module scope

type Handler = (event: unknown) => void;

const loadContent = async (): Promise<{ messageHandlers: Handler[]; ingestSniffedFbMedia: Mock }> => {
  vi.resetModules();
  const addSpy = vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'postMessage').mockImplementation(() => {});

  await import('@/extension/content');

  const messageHandlers = addSpy.mock.calls
    .filter((c) => c[0] === 'message')
    .map((c) => c[1] as Handler);
  addSpy.mockRestore();

  const fbMod = await import('@mbd/core/resolvers/sites/facebook');
  const ingestSniffedFbMedia = fbMod.ingestSniffedFbMedia as unknown as Mock;
  // vi.resetModules() reuses the vi.mock factory's fn (unlike jest.resetModules),
  // so its call history persists across loadContent() calls — clear it per load.
  ingestSniffedFbMedia.mockClear();
  return { messageHandlers, ingestSniffedFbMedia };
};

const fire = (handlers: Handler[], event: unknown): void => handlers.forEach((h) => h(event));

// Same-window, same-origin envelope by default; `over` swaps in a foreign field.
const message = (data: unknown, over: { source?: unknown; origin?: string } = {}): unknown => ({
  source: 'source' in over ? over.source : window,
  origin: 'origin' in over ? over.origin : window.location.origin,
  data,
});

describe('Facebook media relay (facebook.com)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('feeds a valid ibd-fb-media envelope to ingestSniffedFbMedia', async () => {
    const { messageHandlers, ingestSniffedFbMedia } = await loadContent();
    const entries = [{ fbid: '100', kind: 'image', url: 'https://x.fbcdn.net/a.jpg' }];
    fire(messageHandlers, message({ source: 'ibd-fb-media', entries }));
    expect(ingestSniffedFbMedia).toHaveBeenCalledWith(entries);
  });

  it('wires both the FB and HLS relays on facebook.com', async () => {
    expect((await loadContent()).messageHandlers).toHaveLength(2);
  });

  it('ignores a foreign window source, a foreign origin, a wrong tag, and a non-array entries', async () => {
    const { messageHandlers, ingestSniffedFbMedia } = await loadContent();
    fire(messageHandlers, message({ source: 'ibd-fb-media', entries: [] }, { source: {} }));
    fire(messageHandlers, message({ source: 'ibd-fb-media', entries: [] }, { origin: 'https://evil.example' }));
    fire(messageHandlers, message({ source: 'ibd-not-fb', entries: [] }));
    fire(messageHandlers, message({ source: 'ibd-fb-media', entries: 'nope' }));
    fire(messageHandlers, message(null));
    expect(ingestSniffedFbMedia).not.toHaveBeenCalled();
  });

  it('announces ibd-fb-ready so the MAIN sniffer can replay early graphql', async () => {
    vi.resetModules();
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined as never);
    await import('@/extension/content');
    expect(postSpy).toHaveBeenCalledWith({ source: 'ibd-fb-ready' }, window.location.origin);
  });
});
