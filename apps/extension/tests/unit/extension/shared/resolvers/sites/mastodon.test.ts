import { mastodonResolver } from '@mbd/core/resolvers/sites/mastodon';

const run = (href: string) => mastodonResolver.resolve(new URL(href), { allowNetwork: false });
const m = (host: string, size: string, name = 'f7ec49acc7176b5b.jpg') =>
  `https://${host}/media_attachments/files/116/900/935/466/619/911/${size}/${name}`;

describe('mastodonResolver', () => {
  it('matches any media_attachments path (host-agnostic), not other paths', () => {
    expect(mastodonResolver.match(new URL(m('files.mastodon.social', 'small')), { allowNetwork: false })).toBe(true);
    expect(mastodonResolver.match(new URL('https://example.social/system/media_attachments/files/1/2/3/small/x.jpg'), { allowNetwork: false })).toBe(true);
    expect(mastodonResolver.match(new URL('https://mastodon.social/@user/12345'), { allowNetwork: false })).toBe(false);
  });

  it('upgrades /small/ to /original/, keeping the basename (404-safe)', () => {
    const [c] = run(m('files.mastodon.social', 'small'));
    expect(c.url).toBe(m('files.mastodon.social', 'original'));
    expect(c.kind).toBe('image');
    expect(c.thumbnailSrc).toBe(m('files.mastodon.social', 'small'));
    expect(c.ext).toBe('jpg');
  });

  it('is host-agnostic — self-hosted /system/ media path upgrades too', () => {
    const url = 'https://example.social/system/media_attachments/files/1/2/3/small/abc.png';
    const [c] = run(url);
    expect(c.url).toBe('https://example.social/system/media_attachments/files/1/2/3/small/abc.png'.replace('/small/', '/original/'));
    expect(c.ext).toBe('png');
  });

  it('returns [] for an already-/original/ URL (generic keeps it)', () => {
    expect(run(m('files.mastodon.social', 'original'))).toEqual([]);
  });

  it('returns [] when /small/ is not the size segment (basename only)', () => {
    // "small" appears as part of the basename under /original/, not a size folder
    expect(run(m('files.mastodon.social', 'original', 'small_pic.jpg'))).toEqual([]);
  });

  it('carries a webp ext through unchanged basename', () => {
    const [c] = run(m('files.mastodon.social', 'small', 'zz.webp'));
    expect(c.url).toBe(m('files.mastodon.social', 'original', 'zz.webp'));
    expect(c.ext).toBe('webp');
  });
});
