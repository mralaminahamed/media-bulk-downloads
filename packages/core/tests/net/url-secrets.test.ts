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
    // Real Akamai encodes the acl slash as %2f, keeping the token in one segment.
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
    // Real content paths — including a `~user` segment and a long hex content hash —
    // carry no `key=value~key=value` auth shape and must NOT be redacted.
    expect(stripUrlSecrets('https://cdn.example.com/~user/2024/photo.jpg')).toBe(
      'https://cdn.example.com/~user/2024/photo.jpg',
    );
    expect(stripUrlSecrets('https://cdn.example.com/a1b2c3d4e5f6a7b8/master.m3u8')).toBe(
      'https://cdn.example.com/a1b2c3d4e5f6a7b8/master.m3u8',
    );
    // A `~`-joined pair without an auth key stays (e.g. a matrix-param-ish segment).
    expect(stripUrlSecrets('https://cdn.example.com/size=large~fit=cover/img.jpg')).toBe(
      'https://cdn.example.com/size=large~fit=cover/img.jpg',
    );
  });
});
