import { readUrlLease, isLeaseExpired, LEASE_SKEW_MS } from '@mbd/core/net/url-lease';

/** 2026-08-30T00:00:00Z, the reference "now" for every case below. */
const NOW = Date.UTC(2026, 7, 30);
/** 2026-08-31T00:00:00Z as fbcdn writes it: lower-case hex seconds. */
const OE = (Math.floor(NOW / 1000) + 86_400).toString(16);

describe('readUrlLease — fbcdn / cdninstagram (oe)', () => {
  it('reads the hex-seconds `oe` expiry off a signed instagram CDN url', () => {
    const lease = readUrlLease(
      `https://scontent-fra5-2.cdninstagram.com/v/t51.2885-15/1_n.jpg?stp=dst-jpg_e35&_nc_ht=scontent-fra5-2.cdninstagram.com&oh=00_AfDeadBeef&oe=${OE}`,
    );
    expect(lease).toEqual({ expiresAt: (parseInt(OE, 16)) * 1000, rule: 'fbcdn' });
  });

  it('reads it off *.fbcdn.net too', () => {
    const lease = readUrlLease(`https://scontent.xx.fbcdn.net/v/t39/x.jpg?oh=00_Ab&oe=${OE}`);
    expect(lease?.rule).toBe('fbcdn');
  });

  it('returns null for a malformed `oe`', () => {
    expect(readUrlLease('https://scontent.xx.fbcdn.net/v/t39/x.jpg?oh=00_Ab&oe=zzzz')).toBeNull();
  });

  it('returns null for an epoch before 2000 or more than ten years out', () => {
    expect(readUrlLease('https://scontent.xx.fbcdn.net/x.jpg?oe=1')).toBeNull();
    expect(readUrlLease('https://scontent.xx.fbcdn.net/x.jpg?oe=ffffffff0')).toBeNull();
  });

  it('returns null on an fbcdn url with no `oe` at all', () => {
    expect(readUrlLease('https://scontent.xx.fbcdn.net/v/t39/x.jpg?stp=dst-jpg')).toBeNull();
  });
});

describe('readUrlLease — other signed CDNs', () => {
  it('reads a CloudFront `Expires` (decimal seconds)', () => {
    const exp = Math.floor(NOW / 1000) + 3600;
    const lease = readUrlLease(`https://d1.cloudfront.net/v.mp4?Expires=${exp}&Signature=abc&Key-Pair-Id=K1`);
    expect(lease).toEqual({ expiresAt: exp * 1000, rule: 'cloudfront' });
  });

  it('ignores an `Expires` with no CloudFront signature beside it', () => {
    expect(readUrlLease('https://cdn.example.com/v.mp4?Expires=1900000000')).toBeNull();
  });

  it('reads AWS SigV4 `X-Amz-Date` + `X-Amz-Expires`', () => {
    const lease = readUrlLease(
      'https://b.s3.amazonaws.com/o.mp4?X-Amz-Date=20260830T000000Z&X-Amz-Expires=900&X-Amz-Signature=ab',
    );
    expect(lease).toEqual({ expiresAt: NOW + 900_000, rule: 'aws-sigv4' });
  });

  it('reads the GCS `X-Goog-*` equivalent', () => {
    const lease = readUrlLease(
      'https://storage.googleapis.com/b/o.jpg?X-Goog-Date=20260830T000000Z&X-Goog-Expires=600&X-Goog-Signature=ab',
    );
    expect(lease).toEqual({ expiresAt: NOW + 600_000, rule: 'gcs' });
  });

  it('reads an Akamai hdnts `~exp=` path segment', () => {
    const exp = Math.floor(NOW / 1000) + 120;
    const lease = readUrlLease(`https://cdn.example.com/st=1~exp=${exp}~hmac=ff/720p/seg0.ts`);
    expect(lease).toEqual({ expiresAt: exp * 1000, rule: 'akamai-hdnts' });
  });
});

describe('readUrlLease — inert cases', () => {
  it('returns null for a plain url, a data url and unparseable input', () => {
    expect(readUrlLease('https://example.com/a.jpg')).toBeNull();
    expect(readUrlLease('data:image/png;base64,AAAA')).toBeNull();
    expect(readUrlLease('not a url')).toBeNull();
  });
});

describe('isLeaseExpired', () => {
  it('is false without a lease', () => {
    expect(isLeaseExpired(undefined, NOW)).toBe(false);
  });

  it('is false right up to the skew grace and true just past it', () => {
    expect(isLeaseExpired(NOW, NOW)).toBe(false);
    expect(isLeaseExpired(NOW - LEASE_SKEW_MS, NOW)).toBe(false);
    expect(isLeaseExpired(NOW - LEASE_SKEW_MS - 1, NOW)).toBe(true);
  });

  it('is false for a lease still in the future', () => {
    expect(isLeaseExpired(NOW + 3_600_000, NOW)).toBe(false);
  });

  it('is false for a non-finite value rather than refusing a download', () => {
    expect(isLeaseExpired(Number.NaN, NOW)).toBe(false);
  });
});
