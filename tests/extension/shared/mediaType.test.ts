import {
  detectAvType,
  isUndownloadableMedia,
  avExtensionForType,
  extensionFromUrl,
} from '@/extension/shared/mediaType';

describe('detectAvType', () => {
  it('reads the URL extension', () => {
    expect(detectAvType('https://ex.com/clip.mp4')).toBe('mp4');
    expect(detectAvType('https://ex.com/a.WEBM?x=1')).toBe('webm');
    expect(detectAvType('https://ex.com/song.flac')).toBe('flac');
  });
  it('falls back to the MIME subtype', () => {
    expect(detectAvType('https://ex.com/stream', 'video/mp4')).toBe('mp4');
    expect(detectAvType('https://ex.com/x', 'audio/mpeg')).toBe('mp3');
    expect(detectAvType('https://ex.com/x', 'video/quicktime')).toBe('mov');
  });
  it('returns unknown when neither resolves', () => {
    expect(detectAvType('https://ex.com/noext')).toBe('unknown');
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
