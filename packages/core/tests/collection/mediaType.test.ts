import {
  detectAvType,
  isUndownloadableMedia,
  avExtensionForType,
  extensionFromUrl,
  imageExtFromUrl,
  isDashManifest,
  isHlsManifest,
} from '@mbd/core/collection/mediaType';

describe('imageExtFromUrl', () => {
  it('returns the literal image extension, preserving jpg vs jpeg', () => {
    expect(imageExtFromUrl('https://w.wallhaven.cc/full/po/wallhaven-po7y9j.jpg')).toBe('jpg');
    expect(imageExtFromUrl('https://ex.com/a.jpeg?x=1')).toBe('jpeg');
    expect(imageExtFromUrl('https://ex.com/a.PNG')).toBe('png');
  });
  it('ignores query strings and non-image or absent extensions', () => {
    expect(imageExtFromUrl('https://ex.com/render.php?id=1')).toBeNull();
    expect(imageExtFromUrl('https://images.unsplash.com/photo-123')).toBeNull();
    expect(imageExtFromUrl('data:image/png;base64,AAAA')).toBeNull();
  });
  it('reads the bluesky @<fmt> path suffix as an image extension', () => {
    expect(imageExtFromUrl('https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafy123@jpeg')).toBe('jpeg');
    expect(imageExtFromUrl('https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafy123@png')).toBe('png');
  });
});

describe('detectAvType', () => {
  it('reads the URL extension', () => {
    expect(detectAvType('https://ex.com/clip.mp4')).toBe('mp4');
    expect(detectAvType('https://ex.com/a.WEBM?x=1')).toBe('webm');
    expect(detectAvType('https://ex.com/song.flac')).toBe('flac');
    expect(detectAvType('https://ex.com/clip.ogv')).toBe('ogg');
  });
  it('falls back to the MIME subtype', () => {
    expect(detectAvType('https://ex.com/stream', 'video/mp4')).toBe('mp4');
    expect(detectAvType('https://ex.com/x', 'audio/mpeg')).toBe('mp3');
    expect(detectAvType('https://ex.com/x', 'video/quicktime')).toBe('mov');
  });
  it('returns unknown when neither resolves', () => {
    expect(detectAvType('https://ex.com/noext')).toBe('unknown');
  });
  it('ignores a non-audio/video MIME type (fromMime returns null)', () => {
    // The MIME does not start with video/ or audio/, so fromMime bails out and
    // detectAvType falls through to unknown.
    expect(detectAvType('https://ex.com/noext', 'image/png')).toBe('unknown');
    expect(detectAvType('https://ex.com/noext', 'text/html')).toBe('unknown');
  });
  it('ignores an av MIME whose subtype maps to no recognized format', () => {
    // fromMime yields '3gpp'/'basic' — real av subtypes we deliberately do not
    // support — so the VIDEO/AUDIO lookup misses and the result stays unknown.
    expect(detectAvType('https://ex.com/noext', 'video/3gpp')).toBe('unknown');
    expect(detectAvType('https://ex.com/noext', 'audio/basic')).toBe('unknown');
  });
});

describe('extensionFromUrl (edge)', () => {
  it('returns null when the trailing token is not a 1–5 char alphanumeric extension', () => {
    // A dot is present, but the "extension" is too long or carries odd characters,
    // so it fails the /^[a-z0-9]{1,5}$/ guard and is rejected.
    expect(extensionFromUrl('https://ex.com/archive.backup')).toBeNull(); // 6 chars
    expect(extensionFromUrl('https://ex.com/file.name_here')).toBeNull(); // underscore
    expect(extensionFromUrl('https://ex.com/photo.jpeg2000')).toBeNull(); // 8 chars
  });

  it('returns null for a leading-dot dotfile (dot at index 0 is not an extension boundary)', () => {
    // The last path segment is `.gitignore` — the only dot is the first char, so
    // `dot <= 0` holds and no extension is derived (would otherwise wrongly return
    // 'gitignore').
    expect(extensionFromUrl('https://ex.com/path/.gitignore')).toBeNull();
    expect(extensionFromUrl('https://ex.com/.env')).toBeNull();
  });

  it('reads the last extension of a multi-dot filename, ignoring the query', () => {
    expect(extensionFromUrl('https://ex.com/archive.tar.gz?dl=1')).toBe('gz');
  });
});

describe('isHlsManifest', () => {
  it('matches .m3u8 (incl. query/hash), not .mpd', () => {
    expect(isHlsManifest('https://x/master.m3u8')).toBe(true);
    expect(isHlsManifest('https://x/live.m3u8?token=1')).toBe(true);
    expect(isHlsManifest('https://x/live.m3u8#frag')).toBe(true);
    expect(isHlsManifest('https://x/manifest.mpd')).toBe(false);
    expect(isHlsManifest('https://x/video.mp4')).toBe(false);
  });
});

describe('isUndownloadableMedia', () => {
  it('flags blob and streaming manifests', () => {
    expect(isUndownloadableMedia('blob:https://ex.com/abc')).toBe(true);
    expect(isUndownloadableMedia('https://ex.com/p/master.m3u8')).toBe(true);
    expect(isUndownloadableMedia('https://ex.com/p/manifest.mpd?x=1')).toBe(true);
  });
  it('passes normal files', () => {
    expect(isUndownloadableMedia('https://ex.com/a.mp4')).toBe(false);
  });
});

describe('isDashManifest', () => {
  it('matches .mpd (incl. query/hash), not .m3u8', () => {
    expect(isDashManifest('https://x/manifest.mpd')).toBe(true);
    expect(isDashManifest('https://x/m.mpd?token=1')).toBe(true);
    expect(isDashManifest('https://x/m.mpd#f')).toBe(true);
    expect(isDashManifest('https://x/master.m3u8')).toBe(false);
    expect(isDashManifest('https://x/video.mp4')).toBe(false);
  });
});

describe('avExtensionForType / extensionFromUrl', () => {
  it('maps known av types', () => {
    expect(avExtensionForType('mp4')).toBe('mp4');
    expect(avExtensionForType('mp3')).toBe('mp3');
    expect(avExtensionForType('nope')).toBeNull();
  });
  it('extracts a URL extension', () => {
    expect(extensionFromUrl('https://ex.com/a/b.mov?y=2')).toBe('mov');
    expect(extensionFromUrl('https://ex.com/noext')).toBeNull();
  });
});
