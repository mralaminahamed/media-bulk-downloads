/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.instagram.com/" }
 *
 * The MAIN-world Instagram media relay in src/extension/content/index.ts only
 * wires on instagram.com hosts, so this file pins jsdom's location to
 * instagram.com (jsdom's `location` is immutable at runtime — LegacyUnforgeable
 * — so the host has to be fixed per file via `@vitest-environment-options`). Only
 * the resolver entry point the relay forwards to is spied on; the rest of the
 * module stays real. Handlers are captured and driven directly so assertions
 * never depend on listeners left on `window` by an earlier import.
 */
import type { Mock } from 'vitest';

vi.mock('@mbd/core/resolvers/sites/instagram', async () => ({
  ...(await vi.importActual<typeof import('@mbd/core/resolvers/sites/instagram')>('@mbd/core/resolvers/sites/instagram')),
  ingestSniffedIgMedia: vi.fn(),
}));

export {}; // isolate this file's top-level bindings to module scope

type Handler = (event: unknown) => void;

const loadContent = async (): Promise<{ messageHandlers: Handler[]; ingestSniffedIgMedia: Mock }> => {
  vi.resetModules();
  const addSpy = vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'postMessage').mockImplementation(() => {});

  await import('@/extension/content');

  const messageHandlers = addSpy.mock.calls
    .filter((c) => c[0] === 'message')
    .map((c) => c[1] as Handler);
  addSpy.mockRestore();

  const igMod = await import('@mbd/core/resolvers/sites/instagram');
  const ingestSniffedIgMedia = igMod.ingestSniffedIgMedia as unknown as Mock;
  // vi.resetModules() reuses the vi.mock factory's fn (unlike jest.resetModules),
  // so its call history persists across loadContent() calls — clear it per load.
  ingestSniffedIgMedia.mockClear();
  return { messageHandlers, ingestSniffedIgMedia };
};

const fire = (handlers: Handler[], event: unknown): void => handlers.forEach((h) => h(event));

// Same-window, same-origin envelope by default; `over` swaps in a foreign field.
const message = (data: unknown, over: { source?: unknown; origin?: string } = {}): unknown => ({
  source: 'source' in over ? over.source : window,
  origin: 'origin' in over ? over.origin : window.location.origin,
  data,
});

describe('Instagram media relay (instagram.com)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('feeds a valid mbd-ig-media envelope to ingestSniffedIgMedia', async () => {
    const { messageHandlers, ingestSniffedIgMedia } = await loadContent();
    const entries = [{ code: 'ABC', kind: 'image', url: 'https://scontent.cdninstagram.com/a.jpg' }];
    fire(messageHandlers, message({ source: 'mbd-ig-media', entries }));
    expect(ingestSniffedIgMedia).toHaveBeenCalledWith(entries);
  });

  it('wires both the IG and HLS relays on instagram.com', async () => {
    expect((await loadContent()).messageHandlers).toHaveLength(2);
  });

  it('ignores a foreign window source, a foreign origin, a wrong tag, and a non-array entries', async () => {
    const { messageHandlers, ingestSniffedIgMedia } = await loadContent();
    fire(messageHandlers, message({ source: 'mbd-ig-media', entries: [] }, { source: {} }));
    fire(messageHandlers, message({ source: 'mbd-ig-media', entries: [] }, { origin: 'https://evil.example' }));
    fire(messageHandlers, message({ source: 'mbd-not-ig', entries: [] }));
    fire(messageHandlers, message({ source: 'mbd-ig-media', entries: 'nope' }));
    fire(messageHandlers, message(null));
    expect(ingestSniffedIgMedia).not.toHaveBeenCalled();
  });
});
