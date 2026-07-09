import { describe, it, expect } from 'vitest';
import { pinFbUrl, fbidFromUrl, extFromPath } from '@/extension/shared/resolvers/sniffers/fb-media-sniff';

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
});
