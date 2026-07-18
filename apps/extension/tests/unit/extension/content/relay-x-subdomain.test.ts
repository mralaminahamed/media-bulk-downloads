/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://foo.x.com/home" }
 *
 * M1: the MAIN-world X sniffer is injected only on the bare x.com / twitter.com
 * hosts (`matches: ['*://x.com/*', '*://twitter.com/*']` — no `*.` wildcard), so
 * the isolated relay in content/index.ts must gate on those exact hosts too. On
 * an x.com SUBDOMAIN the sniffer never runs, so the relay must NOT register its
 * `mbd-x-media` listener there — otherwise any first-party script on the subdomain
 * could forge an envelope the real sniffer would never have produced.
 */
import type { Mock } from 'vitest';

export {}; // isolate this file's top-level bindings to module scope

type Handler = (event: unknown) => void;

const loadContent = async (): Promise<{ handlers: Handler[]; sendMessage: Mock }> => {
  vi.resetModules();
  const addSpy = vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const sendMessage = chrome.runtime.sendMessage as Mock;
  sendMessage.mockReset();
  sendMessage.mockReturnValue(Promise.resolve(undefined));

  await import('@/extension/content');

  const handlers = addSpy.mock.calls.filter((c) => c[0] === 'message').map((c) => c[1] as Handler);
  addSpy.mockRestore();
  return { handlers, sendMessage };
};

describe('X media relay — subdomain gate (M1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not relay mbd-x-media on an x.com subdomain (sniffer never injected there)', async () => {
    const { handlers, sendMessage } = await loadContent();
    // A same-window, same-origin, correctly-tagged envelope — valid in every way
    // except that the host is a subdomain the sniffer never runs on.
    const event = {
      source: window,
      origin: window.location.origin,
      data: { source: 'mbd-x-media', pairs: [['1', { url: 'https://video.twimg.com/x.mp4' }]] },
    };
    handlers.forEach((h) => h(event));

    const relayed = sendMessage.mock.calls.filter((c) => (c[0] as { type?: string } | undefined)?.type === 'X_MEDIA_SEEN');
    expect(relayed).toHaveLength(0);
  });
});
