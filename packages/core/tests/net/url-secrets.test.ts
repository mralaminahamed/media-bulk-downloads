import { describe, it, expect } from 'vitest';
import { stripUrlSecrets } from '@mbd/core/net/url-secrets';

describe('stripUrlSecrets — query params', () => {
  it('drops signing tokens/signatures/expiry while keeping benign params', () => {
    expect(stripUrlSecrets('https://cdn.example.com/v.m3u8?res=720&token=abc123&Expires=99')).toBe(
      'https://cdn.example.com/v.m3u8?res=720',
    );
    expect(stripUrlSecrets('https://cdn.example.com/x?Signature=zz&Key-Pair-Id=K1&res=hd')).toBe(
      'https://cdn.example.com/x?res=hd',
    );
  });

  it('drops whole presigned families (x-amz-*, x-goog-*)', () => {
    const out = stripUrlSecrets('https://b.s3.amazonaws.com/o.mp4?X-Amz-Signature=a&X-Amz-Credential=b&v=1');
    expect(out).toBe('https://b.s3.amazonaws.com/o.mp4?v=1');
  });

  it('returns the input untouched when there is no secret to strip', () => {
    expect(stripUrlSecrets('https://cdn.example.com/v.m3u8?res=720')).toBe('https://cdn.example.com/v.m3u8?res=720');
    expect(stripUrlSecrets('https://cdn.example.com/v.m3u8')).toBe('https://cdn.example.com/v.m3u8');
    expect(stripUrlSecrets('not a url')).toBe('not a url');
  });
});

describe('stripUrlSecrets — Akamai-style path tokens (I19)', () => {
  it('redacts an hdnts token segment embedded in the path', () => {
    const out = stripUrlSecrets('https://cdn.example.com/exp=1700000000~acl=%2f*~hmac=deadbeef/hi/segment.m3u8');
    expect(out).toBe('https://cdn.example.com/REDACTED/hi/segment.m3u8');
    expect(out).not.toContain('hmac');
    expect(out).not.toContain('deadbeef');
  });

  it('redacts a token segment anywhere in the path, keeping real components', () => {
    const out = stripUrlSecrets('https://cdn.example.com/video/st=1~exp=2~hmac=ff/720p/seg0.ts');
    expect(out).toBe('https://cdn.example.com/video/REDACTED/720p/seg0.ts');
  });

  it('strips BOTH a path token and a query secret in one URL', () => {
    const out = stripUrlSecrets('https://cdn.example.com/exp=1~hmac=ab/v.m3u8?token=q&res=720');
    expect(out).toBe('https://cdn.example.com/REDACTED/v.m3u8?res=720');
  });

  it('leaves ordinary path segments alone (no false positives)', () => {
    expect(stripUrlSecrets('https://cdn.example.com/~user/2024/photo.jpg')).toBe(
      'https://cdn.example.com/~user/2024/photo.jpg',
    );
    expect(stripUrlSecrets('https://cdn.example.com/a1b2c3d4e5f6a7b8/master.m3u8')).toBe(
      'https://cdn.example.com/a1b2c3d4e5f6a7b8/master.m3u8',
    );
    expect(stripUrlSecrets('https://cdn.example.com/size=large~fit=cover/img.jpg')).toBe(
      'https://cdn.example.com/size=large~fit=cover/img.jpg',
    );
  });
});

describe('stripUrlSecrets — Sankaku host-scoped e/m', () => {
  it('strips a Sankaku signed CDN URL down to just its md5 path', () => {
    const md5 = '2620d86cb72802a5dcd9e1e189b75e64';
    const url = `https://v.sankakucomplex.com/data/26/20/${md5}.jpg?e=1784118574&expires=1784118574&m=abc&token=xyz`;
    expect(stripUrlSecrets(url)).toBe(`https://v.sankakucomplex.com/data/26/20/${md5}.jpg`);
  });

  it('leaves e/m untouched on non-Sankaku hosts (benign there)', () => {
    const url = 'https://cdn.example.com/x.jpg?e=1&m=2&res=hd';
    expect(stripUrlSecrets(url)).toBe(url);
  });
});

describe('stripUrlSecrets — fbcdn / cdninstagram signing tokens', () => {
  const SIGNED =
    'https://scontent-fra5-2.cdninstagram.com/v/t51.2885-15/1_n.jpg' +
    '?stp=dst-jpg_e35&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_cat=110' +
    '&_nc_ohc=AbCdEf&_nc_oc=Q6cZ&_nc_gid=GGG&_nc_sid=SSS&oh=00_AfDeadBeef&oe=68B2C3D4';

  it('removes the signature, expiry and per-session tokens', () => {
    const out = stripUrlSecrets(SIGNED);
    for (const p of ['oh=', 'oe=', '_nc_ohc=', '_nc_oc=', '_nc_gid=', '_nc_sid=']) {
      expect(out).not.toContain(p);
    }
  });

  it('keeps the non-secret size and edge hints', () => {
    const out = stripUrlSecrets(SIGNED);
    expect(out).toContain('stp=dst-jpg_e35');
    expect(out).toContain('_nc_cat=110');
    expect(out).toContain('/v/t51.2885-15/1_n.jpg');
  });

  it('applies to *.fbcdn.net too, and to no other host', () => {
    expect(stripUrlSecrets('https://scontent.xx.fbcdn.net/v/x.jpg?oh=00_A&oe=68B2C3D4')).not.toContain('oh=');
    expect(stripUrlSecrets('https://cdn.example.com/x.jpg?oh=00_A&oe=68B2C3D4')).toContain('oh=');
  });
});
