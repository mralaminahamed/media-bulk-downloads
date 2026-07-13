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
import { extractIgMedia } from '@mbd/core/resolvers/sniffers/ig-media-sniff';
import igSniffer from '@/entrypoints/ig-media-sniffer.content';

type RespCfg = { urlKey: string; isApi: (url: string) => boolean; emit: unknown };
type EmitCfg = { guard: (text: string) => boolean; extract: unknown; envelope: (items: unknown[]) => object };

const runMain = (): { resp: RespCfg; emit: EmitCfg } => {
  (igSniffer.main as () => void)();
  return {
    resp: (installResponseSniffer as Mock).mock.calls.at(-1)![0] as RespCfg,
    emit: (makeSnifferEmit as Mock).mock.calls.at(-1)![0] as EmitCfg,
  };
};

describe('ig-media-sniffer content entrypoint', () => {
  beforeEach(() => {
    (installResponseSniffer as Mock).mockClear();
    (makeSnifferEmit as Mock).mockClear();
  });

  it('is a MAIN-world, document_start script scoped to instagram.com', () => {
    expect(igSniffer.matches).toEqual(['*://*.instagram.com/*']);
    expect(igSniffer.runAt).toBe('document_start');
    expect(igSniffer.world).toBe('MAIN');
  });

  it('sniffs the Instagram GraphQL / api/v1 responses under the IG url key', () => {
    const { resp } = runMain();
    expect(resp.urlKey).toBe('__ibdIgUrl');
    expect(resp.isApi('https://www.instagram.com/api/v1/feed/timeline/')).toBe(true);
    expect(resp.isApi('https://www.instagram.com/graphql/query')).toBe(true);
    // A normal page navigation or a static asset must not trip the sniffer.
    expect(resp.isApi('https://www.instagram.com/p/Cabc123/')).toBe(false);
    expect(resp.isApi('https://scontent.cdninstagram.com/v/photo.jpg')).toBe(false);
  });

  it('only parses payloads that actually carry a media graph, via the real extractor', () => {
    const { emit } = runMain();
    expect(emit.guard('{"image_versions2":{"candidates":[]}}')).toBe(true);
    expect(emit.guard('{"video_versions":[]}')).toBe(true);
    expect(emit.guard('{"user":{"id":"1"}}')).toBe(false);
    // The entrypoint delegates extraction to the shared IG extractor (tested
    // separately) — assert it wires the real one, not a stub.
    expect(emit.extract).toBe(extractIgMedia);
  });

  it('wraps extracted entries in the ibd-ig-media envelope the relay expects', () => {
    const { emit } = runMain();
    expect(emit.envelope([{ src: 'a' }, { src: 'b' }])).toEqual({
      source: 'ibd-ig-media',
      entries: [{ src: 'a' }, { src: 'b' }],
    });
  });
});
