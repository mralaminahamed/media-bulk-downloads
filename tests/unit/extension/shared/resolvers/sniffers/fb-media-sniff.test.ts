import { describe, it, expect } from 'vitest';
import { pinFbUrl, fbidFromUrl, extFromPath, numOr, extractFbMedia } from '@/extension/shared/resolvers/sniffers/fb-media-sniff';

describe('pinFbUrl', () => {
  it('accepts https fbcdn / cdninstagram hosts', () => {
    expect(pinFbUrl('https://scontent-lax3-1.xx.fbcdn.net/v/t39/x_n.jpg?oh=a')).toMatch(/fbcdn\.net/);
    expect(pinFbUrl('https://scontent.cdninstagram.com/v/x.mp4')).toMatch(/cdninstagram/);
  });
  it('rejects non-fbcdn hosts, non-https, and non-strings', () => {
    expect(pinFbUrl('https://evil.example.com/x.jpg')).toBeNull();
    expect(pinFbUrl('http://scontent.xx.fbcdn.net/x.jpg')).toBeNull();
    expect(pinFbUrl(42)).toBeNull();
    expect(pinFbUrl('https://notfbcdn.net.evil.com/x.jpg')).toBeNull();
    // Userinfo bypass: `fbcdn.net` is the username, the real host is evil.com.
    expect(pinFbUrl('https://fbcdn.net@evil.com/x.jpg')).toBeNull();
  });
  it('accepts an uppercase host (URL normalizes the hostname to lowercase)', () => {
    expect(pinFbUrl('https://SCONTENT.FBCDN.NET/x.jpg')).toBeTruthy();
  });
});

describe('fbidFromUrl', () => {
  it('parses fbid= / videos / watch / reel forms', () => {
    expect(fbidFromUrl('/photo/?fbid=123&set=a.1')).toBe('123');
    expect(fbidFromUrl('/photo.php?fbid=456')).toBe('456');
    expect(fbidFromUrl('/user/videos/789/')).toBe('789');
    expect(fbidFromUrl('/watch/?v=1011')).toBe('1011');
    expect(fbidFromUrl('/reel/1213')).toBe('1213');
  });
  it('returns null when no id / non-digits', () => {
    expect(fbidFromUrl('/marketplace/')).toBeNull();
    expect(fbidFromUrl('/photo/?fbid=abc')).toBeNull();
    expect(fbidFromUrl(null)).toBeNull();
  });
});

describe('extFromPath', () => {
  it('reads a media extension from the path, else jpg', () => {
    expect(extFromPath('https://x.fbcdn.net/v/t39/a_n.jpg?oh=1')).toBe('jpg');
    expect(extFromPath('https://x.fbcdn.net/v/t39/a_n.mp4')).toBe('mp4');
    expect(extFromPath('https://x.fbcdn.net/v/t39/a_n.svg')).toBe('jpg'); // off-allowlist → default
  });
  it('reads the ext from the path, never the query string', () => {
    // The query is stripped before matching, so an extension smuggled into it
    // cannot spoof (or rescue) the real path extension.
    expect(extFromPath('https://x.fbcdn.net/a.mp4?x=.exe')).toBe('mp4');
    expect(extFromPath('https://x.fbcdn.net/a.exe?x=.mp4')).toBe('jpg');
  });
});

describe('numOr', () => {
  it('passes through a finite positive number', () => {
    expect(numOr(1080)).toBe(1080);
  });
  it('returns undefined for 0, negatives, NaN, and Infinity', () => {
    expect(numOr(0)).toBeUndefined();
    expect(numOr(-5)).toBeUndefined();
    expect(numOr(NaN)).toBeUndefined();
    expect(numOr(Infinity)).toBeUndefined();
  });
  it('returns undefined for non-number inputs', () => {
    expect(numOr('720')).toBeUndefined();
    expect(numOr(null)).toBeUndefined();
    expect(numOr(undefined)).toBeUndefined();
  });
});

describe('extractFbMedia', () => {
  it('picks the largest image per FBID and ignores blurred previews', () => {
    const json = { data: { node: { id: '100', __typename: 'Photo',
      blurred_image: { uri: 'https://x.fbcdn.net/v/blur_n.jpg', width: 20, height: 20 },
      image: { uri: 'https://x.fbcdn.net/v/small_n.jpg', width: 320, height: 240 },
      photo_image: { uri: 'https://x.fbcdn.net/v/orig_n.jpg', width: 2048, height: 1536 } } } };
    const out = extractFbMedia(json).filter((e) => e.fbid === '100' && e.kind === 'image');
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('orig_n.jpg');
    expect(out[0].width).toBe(2048);
  });

  it('extracts a real mp4 video (HD preferred) with its poster', () => {
    const json = { video: { id: '200', __typename: 'Video',
      playable_url: 'https://x.fbcdn.net/v/sd.mp4',
      playable_url_quality_hd: 'https://x.fbcdn.net/v/hd.mp4',
      preferred_thumbnail: { image: { uri: 'https://x.fbcdn.net/v/cover_n.jpg', width: 640, height: 360 } } } };
    const vids = extractFbMedia(json).filter((e) => e.kind === 'video');
    expect(vids).toHaveLength(1);
    expect(vids[0].url).toContain('hd.mp4');
    expect(vids[0].fbid).toBe('200');
    expect(vids[0].poster).toContain('cover_n.jpg');
  });

  it('drops media with no resolvable ancestor id and rejects non-fbcdn urls', () => {
    const json = { image: { uri: 'https://evil.com/x.jpg', width: 800, height: 600 } };            // bad host
    const json2 = { image: { uri: 'https://x.fbcdn.net/y_n.jpg', width: 800, height: 600 } };      // no id
    expect(extractFbMedia(json)).toHaveLength(0);
    expect(extractFbMedia(json2)).toHaveLength(0);
  });
});
