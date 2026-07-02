import { detectType, parseUrlDimensions } from '@/extension/shared/imageUrl';

describe('detectType', () => {
  it('reads a plain extension', () => {
    expect(detectType('https://x.com/a/photo.PNG')).toBe('png');
    expect(detectType('https://x.com/a/photo.jpg?v=2')).toBe('jpeg');
  });

  it('falls back to the format/fm query param when no extension', () => {
    expect(detectType('https://pbs.twimg.com/media/ABC?format=jpg&name=360x360')).toBe('jpeg');
    expect(detectType('https://cdn.test/img?fm=webp')).toBe('webp');
  });

  it('returns unknown when neither is present', () => {
    expect(detectType('https://cdn.test/img?x=1')).toBe('unknown');
  });
});

describe('parseUrlDimensions', () => {
  it('parses a name=WxH token (Twitter)', () => {
    expect(parseUrlDimensions('https://pbs.twimg.com/media/ABC?format=jpg&name=360x480')).toEqual({
      width: 360,
      height: 480,
    });
  });

  it('parses a bare WxH size token (Shopify _800x600, generic)', () => {
    expect(parseUrlDimensions('https://cdn.shopify.com/s/files/x_800x600.jpg')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('parses w/h query params, defaulting the missing axis to 0', () => {
    expect(parseUrlDimensions('https://img.test/a?w=1200')).toEqual({ width: 1200, height: 0 });
    expect(parseUrlDimensions('https://img.test/a?w=1200&h=800')).toEqual({ width: 1200, height: 800 });
  });

  it('returns null for named sizes and size-free urls', () => {
    expect(parseUrlDimensions('https://pbs.twimg.com/media/ABC?name=orig')).toBeNull();
    expect(parseUrlDimensions('https://img.test/photo.jpg')).toBeNull();
  });
});
