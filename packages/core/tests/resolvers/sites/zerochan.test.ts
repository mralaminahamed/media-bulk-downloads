import { zerochanResolver } from '@mbd/core/resolvers/sites/zerochan';

const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });

/** Build a JSON-LD <script> and append it to the document. */
function addJsonLd(obj: unknown): void {
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(obj);
  document.body.appendChild(s);
}

/** Build the #large main-image container with a preview anchor + img. */
function addLarge(href: string | null, thumbSrc: string): HTMLImageElement {
  const large = document.createElement('div');
  large.id = 'large';
  const a = document.createElement('a');
  a.className = 'preview';
  if (href) a.setAttribute('href', href);
  const img = document.createElement('img');
  img.setAttribute('src', thumbSrc);
  a.appendChild(img);
  large.appendChild(a);
  document.body.appendChild(large);
  return img;
}

describe('zerochanResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches on the zerochan page host, not the media host', () => {
    const u = new URL('https://s1.zerochan.net/Tag.600.123.jpg'); // media host
    expect(zerochanResolver.match(u, ctx(undefined, 'https://www.zerochan.net/4708324'))).toBe(true);
    expect(zerochanResolver.match(u, ctx(undefined, 'https://zerochan.net/4708324'))).toBe(true);
    expect(zerochanResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
    expect(zerochanResolver.match(u, { allowNetwork: false })).toBe(false); // no pageUrl
  });

  it('reads the JSON-LD ImageObject contentUrl when el is the main #large image', () => {
    addJsonLd({
      '@type': 'ImageObject',
      contentUrl: 'https://static.zerochan.net/Honkai.Star.Rail.full.4708324.jpg',
      thumbnail: 'https://s1.zerochan.net/Honkai.Star.Rail.600.4708324.jpg',
    });
    const img = addLarge('https://static.zerochan.net/Honkai.Star.Rail.full.4708324.jpg',
      'https://s1.zerochan.net/Honkai.Star.Rail.600.4708324.jpg');
    const [c] = zerochanResolver.resolve(new URL('https://s1.zerochan.net/Honkai.Star.Rail.600.4708324.jpg'), ctx(img, 'https://www.zerochan.net/4708324'));
    expect(c.url).toBe('https://static.zerochan.net/Honkai.Star.Rail.full.4708324.jpg');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('jpg');
    expect(c.thumbnailSrc).toBe('https://s1.zerochan.net/Honkai.Star.Rail.600.4708324.jpg');
  });

  it('falls back to the #large preview anchor when there is no JSON-LD', () => {
    const img = addLarge('https://static.zerochan.net/Foo.Bar.full.99.png',
      'https://s1.zerochan.net/Foo.Bar.600.99.jpg');
    const [c] = zerochanResolver.resolve(new URL('https://s1.zerochan.net/Foo.Bar.600.99.jpg'), ctx(img, 'https://www.zerochan.net/99'));
    expect(c.url).toBe('https://static.zerochan.net/Foo.Bar.full.99.png');
    expect(c.ext).toBe('png');
  });

  it('prefers JSON-LD contentUrl over the anchor when both are present', () => {
    addJsonLd({ '@type': 'ImageObject', contentUrl: 'https://static.zerochan.net/A.full.5.webp' });
    const img = addLarge('https://static.zerochan.net/A.full.5.jpg', 'https://s1.zerochan.net/A.600.5.jpg');
    const [c] = zerochanResolver.resolve(new URL('https://s1.zerochan.net/A.600.5.jpg'), ctx(img, 'https://www.zerochan.net/5'));
    expect(c.url).toBe('https://static.zerochan.net/A.full.5.webp');
  });

  it('does not fire for a thumbnail outside #large (related/grid image)', () => {
    addJsonLd({ '@type': 'ImageObject', contentUrl: 'https://static.zerochan.net/Main.full.1.jpg' });
    const img = document.createElement('img'); // NOT inside #large
    img.setAttribute('src', 'https://s3.zerochan.net/Related.240.2.jpg');
    document.body.appendChild(img);
    expect(zerochanResolver.resolve(new URL('https://s3.zerochan.net/Related.240.2.jpg'), ctx(img, 'https://www.zerochan.net/1'))).toEqual([]);
  });

  it('fail-safe: an off-domain contentUrl is rejected -> []', () => {
    addJsonLd({ '@type': 'ImageObject', contentUrl: 'https://evil.example.com/steal.jpg' });
    const img = addLarge('https://evil.example.com/steal.jpg', 'https://s1.zerochan.net/x.600.3.jpg');
    expect(zerochanResolver.resolve(new URL('https://s1.zerochan.net/x.600.3.jpg'), ctx(img, 'https://www.zerochan.net/3'))).toEqual([]);
  });

  it('fail-safe: malformed JSON-LD is ignored, anchor still used', () => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = '{not valid json';
    document.body.appendChild(s);
    const img = addLarge('https://static.zerochan.net/Ok.full.7.jpg', 'https://s1.zerochan.net/Ok.600.7.jpg');
    const [c] = zerochanResolver.resolve(new URL('https://s1.zerochan.net/Ok.600.7.jpg'), ctx(img, 'https://www.zerochan.net/7'));
    expect(c.url).toBe('https://static.zerochan.net/Ok.full.7.jpg');
  });

  it('returns [] when neither JSON-LD nor a usable anchor is present', () => {
    const img = addLarge(null, 'https://s1.zerochan.net/None.600.8.jpg');
    expect(zerochanResolver.resolve(new URL('https://s1.zerochan.net/None.600.8.jpg'), ctx(img, 'https://www.zerochan.net/8'))).toEqual([]);
  });
});
