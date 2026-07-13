import type { Mock } from 'vitest';

// Capture what the entrypoint wires into the shared response sniffer rather than
// installing the real fetch/XHR hooks (covered by response-sniffer's own tests).
// This isolates the entrypoint-owned logic: the API-URL predicate, the JSON
// guard, the envelope shape, and which extractor is used.
vi.mock('@mbd/core/resolvers/sniffers/response-sniffer', () => ({
  installResponseSniffer: vi.fn(),
  makeSnifferEmit: vi.fn(() => () => {}),
}));

import { installResponseSniffer, makeSnifferEmit } from '@mbd/core/resolvers/sniffers/response-sniffer';
import { extractVideoPairs } from '@mbd/core/resolvers/sniffers/x-media-sniff';
import xSniffer from '@/entrypoints/x-media-sniffer.content';

type RespCfg = { urlKey: string; isApi: (url: string) => boolean; emit: unknown };
type EmitCfg = { guard: (text: string) => boolean; extract: unknown; envelope: (items: unknown[]) => object };

const runMain = (): { resp: RespCfg; emit: EmitCfg } => {
  (xSniffer.main as () => void)();
  return {
    resp: (installResponseSniffer as Mock).mock.calls.at(-1)![0] as RespCfg,
    emit: (makeSnifferEmit as Mock).mock.calls.at(-1)![0] as EmitCfg,
  };
};

describe('x-media-sniffer content entrypoint', () => {
  beforeEach(() => {
    (installResponseSniffer as Mock).mockClear();
    (makeSnifferEmit as Mock).mockClear();
  });

  it('is a MAIN-world, document_start script scoped to x.com and twitter.com', () => {
    expect(xSniffer.matches).toEqual(['*://x.com/*', '*://twitter.com/*']);
    expect(xSniffer.runAt).toBe('document_start');
    expect(xSniffer.world).toBe('MAIN');
  });

  it('sniffs the X GraphQL / v2 API responses under the X url key', () => {
    const { resp } = runMain();
    expect(resp.urlKey).toBe('__ibdUrl');
    expect(resp.isApi('https://x.com/i/api/graphql/abc/TweetDetail')).toBe(true);
    expect(resp.isApi('https://x.com/i/api/2/notifications/all.json')).toBe(true);
    // Other API versions or non-API paths must not trip the sniffer.
    expect(resp.isApi('https://x.com/i/api/1.1/statuses/show.json')).toBe(false);
    expect(resp.isApi('https://x.com/home')).toBe(false);
    expect(resp.isApi('https://video.twimg.com/clip.mp4')).toBe(false);
  });

  it('only parses payloads that carry video_info, via the real extractor', () => {
    const { emit } = runMain();
    expect(emit.guard('{"video_info":{"variants":[]}}')).toBe(true);
    expect(emit.guard('{"legacy":{"full_text":"hi"}}')).toBe(false);
    // The entrypoint delegates extraction to the shared X extractor (tested
    // separately) — assert it wires the real one, not a stub.
    expect(emit.extract).toBe(extractVideoPairs);
  });

  it('wraps extracted [mediaId, mp4] pairs in the ibd-x-media envelope the relay expects', () => {
    const { emit } = runMain();
    const pairs = [['123', 'https://video.twimg.com/a.mp4']];
    expect(emit.envelope(pairs)).toEqual({ source: 'ibd-x-media', pairs });
  });
});
