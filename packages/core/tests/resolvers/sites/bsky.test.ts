import { bskyResolver } from '@mbd/core/resolvers/sites/bsky';

const run = (href: string) => bskyResolver.resolve(new URL(href), { allowNetwork: false });

const DID = 'did:plc:z72i7hdynmk6r22z27h6tvur';
const CID = 'bafkreiabc123def456';
const img = (rend: string, fmt = 'jpeg') =>
  `https://cdn.bsky.app/img/${rend}/plain/${DID}/${CID}@${fmt}`;

describe('bskyResolver', () => {
  it('matches cdn.bsky.app and nothing else', () => {
    expect(bskyResolver.match(new URL(img('feed_fullsize')), { allowNetwork: false })).toBe(true);
    expect(bskyResolver.match(new URL('https://bsky.app/profile/x'), { allowNetwork: false })).toBe(false);
    expect(bskyResolver.match(new URL('https://example.com/x.jpg'), { allowNetwork: false })).toBe(false);
  });

  it('upgrades feed_thumbnail -> feed_fullsize', () => {
    expect(run(img('feed_thumbnail'))[0].url).toBe(img('feed_fullsize'));
  });

  it('upgrades avatar_thumbnail -> avatar', () => {
    expect(run(img('avatar_thumbnail'))[0].url).toBe(img('avatar'));
  });

  it('leaves an already-max feed_fullsize URL unchanged, with no thumbnailSrc', () => {
    const [c] = run(img('feed_fullsize'));
    expect(c.url).toBe(img('feed_fullsize'));
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it('leaves banner unchanged (no thumbnail variant)', () => {
    expect(run(img('banner'))[0].url).toBe(img('banner'));
  });

  it('sets thumbnailSrc to the input only when the URL was upgraded', () => {
    expect(run(img('feed_thumbnail'))[0].thumbnailSrc).toBe(img('feed_thumbnail'));
  });

  it('reads the @<fmt> extension (literal spelling, per imageExtFromUrl)', () => {
    expect(run(img('feed_fullsize', 'jpeg'))[0].ext).toBe('jpeg');
    expect(run(img('feed_fullsize', 'png'))[0].ext).toBe('png');
    expect(run(img('feed_fullsize', 'webp'))[0].ext).toBe('webp');
  });

  it('carries a blob getBlob resolveHint (did + cid) on image renditions, even at max size', () => {
    expect(run(img('feed_fullsize'))[0].resolveHint).toEqual({ platform: 'bsky', id: `blob ${DID} ${CID}` });
    expect(run(img('feed_thumbnail'))[0].resolveHint).toEqual({ platform: 'bsky', id: `blob ${DID} ${CID}` });
  });

  it('emits an unresolved video candidate for feed_video_blob (never a bare still)', () => {
    const [c] = run(img('feed_video_blob'));
    expect(c.kind).toBe('video');
    expect(c.unresolvedVideo).toBe(true);
    expect(c.poster).toBe(img('feed_video_blob'));
    expect(c.resolveHint).toEqual({ platform: 'bsky', id: `video ${DID} ${CID}` });
  });

  it('parses a did:web account in the path', () => {
    const href = `https://cdn.bsky.app/img/feed_thumbnail/plain/did:web:example.com/${CID}@jpeg`;
    const [c] = run(href);
    expect(c.url).toBe(`https://cdn.bsky.app/img/feed_fullsize/plain/did:web:example.com/${CID}@jpeg`);
    expect(c.resolveHint).toEqual({ platform: 'bsky', id: `blob did:web:example.com ${CID}` });
  });

  it('returns [] for a non-/img path so the generic resolver takes over', () => {
    expect(run('https://cdn.bsky.app/xrpc/com.atproto.sync.getBlob?did=x&cid=y')).toEqual([]);
    expect(run('https://cdn.bsky.app/img/feed_fullsize/plain/not-a-did/cid@jpeg')).toEqual([]);
  });
});
