import { isSafeCaptureUrl, assertSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';

describe('isSafeCaptureUrl — SSRF guard for stream capture', () => {
  it('allows ordinary public http(s) hosts', () => {
    expect(isSafeCaptureUrl('https://cdn.example.com/seg1.ts')).toBe(true);
    expect(isSafeCaptureUrl('http://media.example.org/init.mp4')).toBe(true);
    expect(isSafeCaptureUrl('https://8.8.8.8/seg.ts')).toBe(true); // public IP
  });

  it('rejects non-http(s) schemes', () => {
    for (const u of [
      'file:///etc/passwd',
      'ftp://host/x',
      'blob:https://x/uuid',
      'data:text/plain,hi',
      'gopher://host/',
      'chrome-extension://abc/x',
    ]) {
      expect(isSafeCaptureUrl(u)).toBe(false);
    }
  });

  it('rejects loopback hosts (localhost, 127/8, ::1)', () => {
    expect(isSafeCaptureUrl('http://localhost/seg.ts')).toBe(false);
    expect(isSafeCaptureUrl('http://localhost:9200/x')).toBe(false);
    expect(isSafeCaptureUrl('http://127.0.0.1/seg.ts')).toBe(false);
    expect(isSafeCaptureUrl('http://127.1.2.3/x')).toBe(false);
    expect(isSafeCaptureUrl('http://[::1]/x')).toBe(false);
    expect(isSafeCaptureUrl('http://[::1]:8080/x')).toBe(false);
  });

  it('rejects cloud-metadata / link-local (169.254.0.0/16) — the classic SSRF target', () => {
    expect(isSafeCaptureUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeCaptureUrl('http://169.254.0.1/x')).toBe(false);
  });

  it('rejects RFC-1918 private ranges (10/8, 172.16/12, 192.168/16)', () => {
    expect(isSafeCaptureUrl('http://10.0.0.5/x')).toBe(false);
    expect(isSafeCaptureUrl('http://172.16.0.1/x')).toBe(false);
    expect(isSafeCaptureUrl('http://172.31.255.255/x')).toBe(false);
    expect(isSafeCaptureUrl('http://192.168.1.1/x')).toBe(false);
    // 172.15 and 172.32 are public (just outside the /12) — must stay allowed.
    expect(isSafeCaptureUrl('http://172.15.0.1/x')).toBe(true);
    expect(isSafeCaptureUrl('http://172.32.0.1/x')).toBe(true);
  });

  it('rejects 0.0.0.0/8, CGNAT (100.64/10), and multicast/reserved (>=224)', () => {
    expect(isSafeCaptureUrl('http://0.0.0.0/x')).toBe(false);
    expect(isSafeCaptureUrl('http://100.64.0.1/x')).toBe(false);
    expect(isSafeCaptureUrl('http://239.0.0.1/x')).toBe(false);
    expect(isSafeCaptureUrl('http://255.255.255.255/x')).toBe(false);
  });

  it('rejects IPv4 encoded as decimal / hex / octal (SSRF bypass tricks)', () => {
    // All of these decode to 127.0.0.1.
    expect(isSafeCaptureUrl('http://2130706433/x')).toBe(false); // decimal
    expect(isSafeCaptureUrl('http://0x7f000001/x')).toBe(false); // hex
    expect(isSafeCaptureUrl('http://017700000001/x')).toBe(false); // octal
    // 3232235521 === 192.168.0.1
    expect(isSafeCaptureUrl('http://3232235521/x')).toBe(false);
  });

  it('rejects IPv6 link-local (fe80::/10), unique-local (fc00::/7), and IPv4-mapped loopback', () => {
    expect(isSafeCaptureUrl('http://[fe80::1]/x')).toBe(false);
    expect(isSafeCaptureUrl('http://[fc00::1]/x')).toBe(false);
    expect(isSafeCaptureUrl('http://[fd12:3456::1]/x')).toBe(false);
    expect(isSafeCaptureUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
    expect(isSafeCaptureUrl('http://[::]/x')).toBe(false);
  });

  it('rejects .localhost and .local (mDNS) suffixes', () => {
    expect(isSafeCaptureUrl('http://api.localhost/x')).toBe(false);
    expect(isSafeCaptureUrl('http://printer.local/x')).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(isSafeCaptureUrl('not a url')).toBe(false);
    expect(isSafeCaptureUrl('')).toBe(false);
    expect(isSafeCaptureUrl('//protocol-relative/x')).toBe(false);
  });

  it('assertSafeCaptureUrl throws on a blocked URL and passes a safe one', () => {
    expect(() => assertSafeCaptureUrl('http://169.254.169.254/')).toThrow();
    expect(() => assertSafeCaptureUrl('https://cdn.example.com/seg.ts')).not.toThrow();
  });
});
