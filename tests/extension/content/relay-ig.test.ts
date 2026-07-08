/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.instagram.com/"}
 *
 * The MAIN-world Instagram media relay in src/extension/content/index.ts only
 * wires on instagram.com hosts, so this file pins jsdom's location to
 * instagram.com (jsdom's `location` is immutable at runtime — LegacyUnforgeable
 * — so the host has to be fixed per file via `@jest-environment-options`). Only
 * the resolver entry point the relay forwards to is spied on; the rest of the
 * module stays real. Handlers are captured and driven directly so assertions
 * never depend on listeners left on `window` by an earlier import.
 */
jest.mock('@/extension/shared/resolvers/sites/instagram', () => ({
  ...jest.requireActual('@/extension/shared/resolvers/sites/instagram'),
  ingestSniffedIgMedia: jest.fn(),
}));

export {}; // isolate this file's top-level bindings to module scope

type Handler = (event: unknown) => void;

const loadContent = (): { messageHandlers: Handler[]; ingestSniffedIgMedia: jest.Mock } => {
  jest.resetModules();
  const addSpy = jest.spyOn(window, 'addEventListener');
  jest.spyOn(window, 'postMessage').mockImplementation(() => {});

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/extension/content');

  const messageHandlers = addSpy.mock.calls
    .filter((c) => c[0] === 'message')
    .map((c) => c[1] as Handler);
  addSpy.mockRestore();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const igMod = require('@/extension/shared/resolvers/sites/instagram');
  return { messageHandlers, ingestSniffedIgMedia: igMod.ingestSniffedIgMedia };
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
    jest.restoreAllMocks();
  });

  afterAll(() => {
    jest.resetModules();
  });

  it('feeds a valid ibd-ig-media envelope to ingestSniffedIgMedia', () => {
    const { messageHandlers, ingestSniffedIgMedia } = loadContent();
    const entries = [{ code: 'ABC', kind: 'image', url: 'https://scontent.cdninstagram.com/a.jpg' }];
    fire(messageHandlers, message({ source: 'ibd-ig-media', entries }));
    expect(ingestSniffedIgMedia).toHaveBeenCalledWith(entries);
  });

  it('wires both the IG and HLS relays on instagram.com', () => {
    expect(loadContent().messageHandlers).toHaveLength(2);
  });

  it('ignores a foreign window source, a foreign origin, a wrong tag, and a non-array entries', () => {
    const { messageHandlers, ingestSniffedIgMedia } = loadContent();
    fire(messageHandlers, message({ source: 'ibd-ig-media', entries: [] }, { source: {} }));
    fire(messageHandlers, message({ source: 'ibd-ig-media', entries: [] }, { origin: 'https://evil.example' }));
    fire(messageHandlers, message({ source: 'ibd-not-ig', entries: [] }));
    fire(messageHandlers, message({ source: 'ibd-ig-media', entries: 'nope' }));
    fire(messageHandlers, message(null));
    expect(ingestSniffedIgMedia).not.toHaveBeenCalled();
  });
});
