import type { Mock } from 'vitest';

// Capture what the entrypoint wires into the shared sniffer rather than
// installing the real fetch/XHR hooks (covered by response-sniffer's own tests).
vi.mock('@/extension/shared/resolvers/sniffers/response-sniffer', () => ({
  installResponseSniffer: vi.fn(),
  makeSnifferEmit: vi.fn(() => () => {}),
  installReplayOnReady: vi.fn(),
}));

import { installResponseSniffer, makeSnifferEmit, installReplayOnReady } from '@/extension/shared/resolvers/sniffers/response-sniffer';
import { extractFbMedia } from '@/extension/shared/resolvers/sniffers/fb-media-sniff';
import fbSniffer from '@/entrypoints/fb-media-sniffer.content';

type RespCfg = { urlKey: string; isApi: (url: string) => boolean; contentTypeOk?: (ct: string) => boolean; emit: unknown };
type EmitCfg = { guard: (text: string) => boolean; extract: unknown; envelope: (items: unknown[]) => object; ndjson?: boolean };

const runMain = (): { resp: RespCfg; emit: EmitCfg } => {
  (fbSniffer.main as () => void)();
  return {
    resp: (installResponseSniffer as Mock).mock.calls.at(-1)![0] as RespCfg,
    emit: (makeSnifferEmit as Mock).mock.calls.at(-1)![0] as EmitCfg,
  };
};

describe('fb-media-sniffer content entrypoint', () => {
  beforeEach(() => {
    (installResponseSniffer as Mock).mockClear();
    (makeSnifferEmit as Mock).mockClear();
    (installReplayOnReady as Mock).mockClear();
  });

  it('is a MAIN-world, document_start script scoped to facebook.com', () => {
    expect(fbSniffer.matches).toEqual(['*://*.facebook.com/*']);
    expect(fbSniffer.runAt).toBe('document_start');
    expect(fbSniffer.world).toBe('MAIN');
  });

  it('sniffs graphql under the FB url key and accepts FB text/html responses', () => {
    const { resp } = runMain();
    expect(resp.urlKey).toBe('__ibdFbUrl');
    expect(resp.isApi('https://www.facebook.com/api/graphql/')).toBe(true);
    expect(resp.isApi('https://www.facebook.com/graphql/')).toBe(true);
    expect(resp.isApi('https://www.facebook.com/natgeo/photos')).toBe(false);
    // FB serves graphql as text/html, not application/json — the sniffer must accept it.
    expect(resp.contentTypeOk?.('text/html; charset=utf-8')).toBe(true);
    expect(resp.contentTypeOk?.('application/json')).toBe(true);
  });

  it('parses FB graphql as NDJSON via the real extractor, guarding on media substrings', () => {
    const { emit } = runMain();
    expect(emit.ndjson).toBe(true);
    expect(emit.extract).toBe(extractFbMedia);
    expect(emit.guard('{"x":"https://scontent.xx.fbcdn.net/y.jpg"}')).toBe(true);
    expect(emit.guard('{"playable_url":"..."}')).toBe(true);
    expect(emit.guard('{"progressive_url":"..."}')).toBe(true);
    expect(emit.guard('{"user":{"id":"1"}}')).toBe(false);
  });

  it('wraps extracted entries in the ibd-fb-media envelope the relay expects', () => {
    const { emit } = runMain();
    expect(emit.envelope([{ fbid: '1' }])).toEqual({ source: 'ibd-fb-media', entries: [{ fbid: '1' }] });
  });

  it('buffers emitted entries and replays them once the isolated relay is ready', () => {
    const posted: unknown[] = [];
    (window.postMessage as unknown) = vi.fn((m: unknown) => posted.push(m));
    const { emit } = runMain();

    // Before the relay is ready, the envelope returns the live envelope AND buffers.
    expect(emit.envelope([{ fbid: '1' }])).toEqual({ source: 'ibd-fb-media', entries: [{ fbid: '1' }] });
    emit.envelope([{ fbid: '2' }]);

    const [source, replay] = (installReplayOnReady as Mock).mock.calls.at(-1)! as [string, () => void];
    expect(source).toBe('ibd-fb-ready');
    replay();
    expect(posted).toContainEqual({ source: 'ibd-fb-media', entries: [{ fbid: '1' }, { fbid: '2' }] });
  });

  it('does not buffer entries emitted after the relay is ready (no double replay)', () => {
    const posted: unknown[] = [];
    (window.postMessage as unknown) = vi.fn((m: unknown) => posted.push(m));
    const { emit } = runMain();
    const replay = (installReplayOnReady as Mock).mock.calls.at(-1)![1] as () => void;

    replay(); // relay ready, nothing buffered yet -> no post
    expect(posted).toHaveLength(0);

    emit.envelope([{ fbid: '9' }]); // post-ready -> live only, not buffered
    replay(); // buffer empty -> still no replay post
    expect(posted).toHaveLength(0);
  });
});
