import { readFileSync } from 'node:fs';
import { redditResolver } from '@/extension/shared/resolvers/sites/reddit';
import { parseMaster, parseAudioRenditions, selectVariant, selectAudioRendition, isMasterPlaylist } from '@/extension/shared/download/hls';

const resolve = (href: string) => redditResolver.resolve(new URL(href), { allowNetwork: false });
const m = (href: string) => redditResolver.match(new URL(href), { allowNetwork: false });

const VID = '8tnc0d8mu3ch1';

describe('redditResolver — match', () => {
  it('matches i.redd.it, preview.redd.it and v.redd.it; leaves external-preview to generic', () => {
    expect(m('https://i.redd.it/abc.jpg')).toBe(true);
    expect(m('https://preview.redd.it/abc.jpg?width=640&s=deadbeef')).toBe(true);
    expect(m(`https://v.redd.it/${VID}/HLSPlaylist.m3u8`)).toBe(true);
    expect(m('https://external-preview.redd.it/abc.png?s=deadbeef')).toBe(false);
    expect(m('https://www.reddit.com/r/x/')).toBe(false);
    expect(m('https://example.com/x.jpg')).toBe(false);
  });
});

describe('redditResolver — images', () => {
  it('upgrades a signed preview.redd.it rendition to the unsigned i.redd.it original', () => {
    const [c] = resolve('https://preview.redd.it/ch5ejccb04ch1.jpeg?width=640&crop=smart&auto=webp&s=deadbeef');
    expect(c).toMatchObject({ kind: 'image', url: 'https://i.redd.it/ch5ejccb04ch1.jpeg' });
    expect(c.thumbnailSrc).toBe('https://preview.redd.it/ch5ejccb04ch1.jpeg?width=640&crop=smart&auto=webp&s=deadbeef');
    expect(c.ext).toBe('jpeg');
  });

  it('strips a tracking query from an i.redd.it URL', () => {
    const [c] = resolve('https://i.redd.it/ch5ejccb04ch1.jpeg?utm=1');
    expect(c.url).toBe('https://i.redd.it/ch5ejccb04ch1.jpeg');
    expect(c.thumbnailSrc).toBe('https://i.redd.it/ch5ejccb04ch1.jpeg?utm=1');
  });

  it('leaves a already-clean i.redd.it URL unchanged, with no thumbnailSrc', () => {
    const [c] = resolve('https://i.redd.it/ch5ejccb04ch1.jpeg');
    expect(c.url).toBe('https://i.redd.it/ch5ejccb04ch1.jpeg');
    expect(c.thumbnailSrc).toBeUndefined();
  });
});

describe('redditResolver — video', () => {
  it('maps the silent v.redd.it fallback mp4 to a pending video with a reddit hint (id from the path)', () => {
    const [c] = resolve(`https://v.redd.it/${VID}/CMAF_720.mp4?source=fallback`);
    expect(c).toMatchObject({
      kind: 'video',
      unresolvedVideo: true,
      resolveHint: { platform: 'reddit', id: VID },
    });
  });

  it('maps a v.redd.it HLS master URL to the same pending video hint', () => {
    const [c] = resolve(`https://v.redd.it/${VID}/HLSPlaylist.m3u8`);
    expect(c.resolveHint).toEqual({ platform: 'reddit', id: VID });
  });

  it('returns [] for a v.redd.it URL with no id segment', () => {
    expect(resolve('https://v.redd.it/')).toEqual([]);
  });
});

describe('reddit HLS master (real fixture) — the engine can mux the separate audio', () => {
  // Vitest runs with cwd at the project root; jsdom's import.meta.url is an http
  // URL, so resolve the fixture from cwd rather than the module URL.
  const master = readFileSync('tests/unit/fixtures/reddit/hls-master.m3u8', 'utf8');
  const base = `https://v.redd.it/${VID}/HLSPlaylist.m3u8`;

  it('is recognised as a master with demuxed audio renditions', () => {
    expect(isMasterPlaylist(master)).toBe(true);
    const audio = parseAudioRenditions(master, base);
    expect(audio).toHaveLength(2);
    expect(audio.every((a) => !!a.uri)).toBe(true); // separate (demuxed) tracks
  });

  it('the highest variant names an AUDIO group whose rendition is muxed back in', () => {
    const variants = parseMaster(master, base);
    const best = selectVariant(variants, 'highest');
    expect(best.audioGroup).toBe('6'); // the 480x800 variant
    const audio = selectAudioRendition(parseAudioRenditions(master, base), best);
    expect(audio?.uri).toBe(`https://v.redd.it/${VID}/CMAF_AUDIO_128.m3u8`);
  });
});
