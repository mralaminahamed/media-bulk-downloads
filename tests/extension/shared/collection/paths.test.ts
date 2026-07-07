import {
  sanitizePathSegment,
  expandPathTemplate,
  hostFromUrl,
  registrableDomain,
  PathTokens,
} from '@/extension/shared/collection/paths';

describe('hostFromUrl', () => {
  it('returns the hostname of an http(s) URL', () => {
    expect(hostFromUrl('https://www.twitter.com/x/status/1')).toBe('www.twitter.com');
    expect(hostFromUrl('http://example.com:8080/a')).toBe('example.com');
  });

  it('returns empty string for missing or unparseable input', () => {
    expect(hostFromUrl(undefined)).toBe('');
    expect(hostFromUrl('')).toBe('');
    expect(hostFromUrl('not a url')).toBe('');
  });
});

describe('registrableDomain', () => {
  it('strips www and subdomains down to the registrable domain', () => {
    expect(registrableDomain('www.twitter.com')).toBe('twitter.com');
    expect(registrableDomain('m.twitter.com')).toBe('twitter.com');
    expect(registrableDomain('twitter.com')).toBe('twitter.com');
    expect(registrableDomain('a.b.example.org')).toBe('example.org');
  });

  it('keeps three labels for known two-part public suffixes', () => {
    expect(registrableDomain('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomain('shop.example.com.au')).toBe('example.com.au');
  });

  it('returns empty string for empty host', () => {
    expect(registrableDomain('')).toBe('');
  });
});

describe('expandPathTemplate', () => {
  const tokens = {
    host: 'www.example.com',
    domain: 'example.com',
    date: '2026-07-04',
    kind: 'image',
  };

  it('leaves a literal template (no tokens) unchanged apart from sanitizing', () => {
    expect(expandPathTemplate('Media', tokens)).toBe('Media');
    expect(expandPathTemplate('../my/pics', tokens)).toBe('my/pics');
    expect(expandPathTemplate('', tokens)).toBe('');
  });

  it('substitutes each supported token', () => {
    expect(expandPathTemplate('{host}', tokens)).toBe('www.example.com');
    expect(expandPathTemplate('{domain}', tokens)).toBe('example.com');
    expect(expandPathTemplate('{date}', tokens)).toBe('2026-07-04');
    expect(expandPathTemplate('{kind}', tokens)).toBe('image');
  });

  it('substitutes multiple tokens mixed with literal segments', () => {
    expect(expandPathTemplate('Media/{domain}/{date}', tokens)).toBe(
      'Media/example.com/2026-07-04',
    );
    expect(expandPathTemplate('{kind}/{host}', tokens)).toBe('image/www.example.com');
  });

  it('drops the segment when a token value is empty (unknown host)', () => {
    const noHost = { ...tokens, host: '', domain: '' };
    expect(expandPathTemplate('Media/{domain}', noHost)).toBe('Media');
    expect(expandPathTemplate('{domain}/{date}', noHost)).toBe('2026-07-04');
    expect(expandPathTemplate('{host}', noHost)).toBe('');
  });

  it('strips unknown tokens rather than leaving braces in the path', () => {
    expect(expandPathTemplate('Media/{foo}/{domain}', tokens)).toBe('Media/example.com');
  });

  it('treats a token value as a single segment (no injected subfolders)', () => {
    const evil = { ...tokens, domain: 'a/../../b' };
    expect(expandPathTemplate('{domain}', evil)).toBe('ab');
  });

  it('treats a missing/undefined token value as empty (defensive)', () => {
    // A token object with an unresolved value (e.g. `kind` never set) must collapse
    // that segment rather than emit the literal `undefined` into the path.
    const partial = { host: 'ex.com', domain: 'ex.com', date: '2026-07-04' } as unknown as PathTokens;
    expect(expandPathTemplate('{kind}/pics', partial)).toBe('pics');
    expect(expandPathTemplate('{host}/{kind}', partial)).toBe('ex.com');
  });
});

describe('sanitizePathSegment (regression)', () => {
  it('still strips traversal and illegal characters', () => {
    expect(sanitizePathSegment('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizePathSegment('bad:name?.txt')).toBe('badname.txt');
  });
});
