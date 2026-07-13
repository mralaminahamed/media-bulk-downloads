/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.pinterest.com/" }
 *
 * The MAIN-world Pinterest media relay in src/extension/content/index.ts only
 * wires on pinterest.com (+ ccTLD) hosts, so this file pins jsdom's location to
 * pinterest.com (jsdom's `location` is immutable at runtime — LegacyUnforgeable
 * — so the host has to be fixed per file via `@vitest-environment-options`). Only
 * the resolver entry point the relay forwards to is spied on; the rest of the
 * module stays real. Handlers are captured and driven directly so assertions
 * never depend on listeners left on `window` by an earlier import.
 */
import type { Mock } from 'vitest';

vi.mock('@/extension/shared/resolvers/sites/pinterest', async () => ({
  ...(await vi.importActual<typeof import('@/extension/shared/resolvers/sites/pinterest')>('@/extension/shared/resolvers/sites/pinterest')),
  ingestSniffedPinterestMedia: vi.fn(),
}));

export {}; // isolate this file's top-level bindings to module scope

type Handler = (event: unknown) => void;

const loadContent = async (): Promise<{ messageHandlers: Handler[]; ingestSniffedPinterestMedia: Mock }> => {
  vi.resetModules();
  const addSpy = vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'postMessage').mockImplementation(() => {});

  await import('@/extension/content');

  const messageHandlers = addSpy.mock.calls
    .filter((c) => c[0] === 'message')
    .map((c) => c[1] as Handler);
  addSpy.mockRestore();

  const pinterestMod = await import('@/extension/shared/resolvers/sites/pinterest');
  const ingestSniffedPinterestMedia = pinterestMod.ingestSniffedPinterestMedia as unknown as Mock;
  // vi.resetModules() reuses the vi.mock factory's fn (unlike jest.resetModules),
  // so its call history persists across loadContent() calls — clear it per load.
  ingestSniffedPinterestMedia.mockClear();
  return { messageHandlers, ingestSniffedPinterestMedia };
};

const fire = (handlers: Handler[], event: unknown): void => handlers.forEach((h) => h(event));

// Same-window, same-origin envelope by default; `over` swaps in a foreign field.
const message = (data: unknown, over: { source?: unknown; origin?: string } = {}): unknown => ({
  source: 'source' in over ? over.source : window,
  origin: 'origin' in over ? over.origin : window.location.origin,
  data,
});

describe('Pinterest media relay (pinterest.com)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('feeds a valid ibd-pinterest-media envelope to ingestSniffedPinterestMedia', async () => {
    const { messageHandlers, ingestSniffedPinterestMedia } = await loadContent();
    const entries = [{ pinId: '1', kind: 'image', url: 'https://i.pinimg.com/originals/a.jpg', ext: 'jpg' }];
    fire(messageHandlers, message({ source: 'ibd-pinterest-media', entries }));
    expect(ingestSniffedPinterestMedia).toHaveBeenCalledWith(entries);
  });

  it('wires both the Pinterest and HLS relays on pinterest.com', async () => {
    expect((await loadContent()).messageHandlers).toHaveLength(2);
  });

  it('ignores a foreign window source, a foreign origin, a wrong tag, and a non-array entries', async () => {
    const { messageHandlers, ingestSniffedPinterestMedia } = await loadContent();
    fire(messageHandlers, message({ source: 'ibd-pinterest-media', entries: [] }, { source: {} }));
    fire(messageHandlers, message({ source: 'ibd-pinterest-media', entries: [] }, { origin: 'https://evil.example' }));
    fire(messageHandlers, message({ source: 'ibd-not-pinterest', entries: [] }));
    fire(messageHandlers, message({ source: 'ibd-pinterest-media', entries: 'nope' }));
    fire(messageHandlers, message(null));
    expect(ingestSniffedPinterestMedia).not.toHaveBeenCalled();
  });

  it('announces ibd-pinterest-ready so the MAIN sniffer can replay early /resource/ responses', async () => {
    vi.resetModules();
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined as never);
    await import('@/extension/content');
    expect(postSpy).toHaveBeenCalledWith({ source: 'ibd-pinterest-ready' }, window.location.origin);
  });
});
