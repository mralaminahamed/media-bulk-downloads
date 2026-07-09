import { flickrResolver } from '@/extension/shared/resolvers/sites/flickr';

const resolve = (href: string) => flickrResolver.resolve(new URL(href), { allowNetwork: false });
const m = (href: string) => flickrResolver.match(new URL(href), { allowNetwork: false });

const ID = '55379291849';
const SECRET = '42e9ef501b';
const base = (size?: string) => `https://live.staticflickr.com/65535/${ID}_${SECRET}${size ? `_${size}` : ''}.jpg`;

describe('flickrResolver — match', () => {
  it('matches staticflickr.com and its subdomains only', () => {
    expect(m(base('n'))).toBe(true); // live.staticflickr.com
    expect(m(`https://farm5.staticflickr.com/4104/${ID}_${SECRET}_z.jpg`)).toBe(true);
    expect(m(`https://staticflickr.com/65535/${ID}_${SECRET}_b.jpg`)).toBe(true);
    expect(m('https://www.flickr.com/photos/x/1/')).toBe(false);
    expect(m('https://evilstaticflickr.com/x.jpg')).toBe(false);
    expect(m('https://example.com/x.jpg')).toBe(false);
  });
});

describe('flickrResolver — resolve', () => {
  it('upgrades a small size to _b and attaches a flickr hint (photo id from the path)', () => {
    const [c] = resolve(base('n'));
    expect(c).toMatchObject({ kind: 'image', url: base('b'), ext: 'jpg', resolveHint: { platform: 'flickr', id: ID } });
    expect(c.thumbnailSrc).toBe(base('n'));
  });

  it('leaves the medium (no size code) URL unchanged but still hints for a larger size', () => {
    const [c] = resolve(base());
    expect(c.url).toBe(base());
    expect(c.thumbnailSrc).toBeUndefined();
    expect(c.resolveHint).toEqual({ platform: 'flickr', id: ID });
  });

  it('does not downsize a size already larger than _b, and still hints', () => {
    const [c] = resolve(base('6k'));
    expect(c.url).toBe(base('6k'));
    expect(c.resolveHint).toEqual({ platform: 'flickr', id: ID });
  });

  it('returns [] for a non-photo staticflickr asset (e.g. a buddyicon), letting generic handle it', () => {
    expect(resolve('https://combo.staticflickr.com/pw/styleguide.css')).toEqual([]);
    expect(resolve('https://staticflickr.com/65535/notaphoto.jpg')).toEqual([]);
  });
});
