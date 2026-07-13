import { describe, it, expect } from 'vitest';
import { PINTEREST_DOMAINS, PINTEREST_MATCHES, isPinterestHost } from '@mbd/core/resolvers/sniffers/pinterest-hosts';

describe('pinterest-hosts', () => {
  it('matches the apex and subdomains of every listed domain', () => {
    expect(isPinterestHost('www.pinterest.com')).toBe(true);
    expect(isPinterestHost('pinterest.com')).toBe(true);
    expect(isPinterestHost('in.pinterest.com')).toBe(true);
    expect(isPinterestHost('www.pinterest.co.uk')).toBe(true);
    expect(isPinterestHost('pinterest.fr')).toBe(true);
  });
  it('rejects non-Pinterest and look-alike hosts', () => {
    expect(isPinterestHost('example.com')).toBe(false);
    expect(isPinterestHost('notpinterest.com')).toBe(false);
    expect(isPinterestHost('pinterest.com.evil.com')).toBe(false);
    expect(isPinterestHost('i.pinimg.com')).toBe(false);
  });
  it('derives one *://*.<domain>/* match pattern per domain', () => {
    expect(PINTEREST_MATCHES).toHaveLength(PINTEREST_DOMAINS.length);
    expect(PINTEREST_MATCHES).toContain('*://*.pinterest.com/*');
    expect(PINTEREST_MATCHES.every((m) => m.startsWith('*://*.pinterest.') && m.endsWith('/*'))).toBe(true);
  });
});
