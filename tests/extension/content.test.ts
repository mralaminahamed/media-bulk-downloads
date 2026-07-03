import {
  isBase64Image,
  getBase64ImageType,
  getBase64ImageSize,
  getImageDimensions,
  getImageType,
  parseSrcset,
  resolveUrl,
  collectMedia,
} from '@/extension/content';

// Resolve a relative test path the same way the content script does, so
// assertions match the absolute URLs jsdom produces.
const abs = (path: string): string => new URL(path, document.baseURI).href;

describe('Content Script', () => {
  beforeEach(() => {
    document.body.innerHTML = `
        <img src="test1.jpg" alt="Test 1" width="100" height="100">
        <img src="test2.png" alt="Test 2" width="200" height="200" srcset="test2-small.png 300w, test2-large.png 1000w">
        <picture>
          <source srcset="test3-wide.webp 1000w, test3-narrow.webp 500w" type="image/webp">
          <img src="test3.jpg" alt="Test 3" width="300" height="300">
        </picture>
        <div style="background-image: url('test4.gif');"></div>
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==" alt="Base64 Image">
      `;
  });

  describe('isBase64Image', () => {
    it('correctly identifies base64 images', () => {
      expect(isBase64Image('data:image/png;base64,abc123')).toBe(true);
      expect(isBase64Image('https://example.com/image.png')).toBe(false);
    });
  });

  describe('getBase64ImageType', () => {
    it('extracts correct image type from base64 string', () => {
      expect(getBase64ImageType('data:image/png;base64,abc123')).toBe('png');
      expect(getBase64ImageType('data:image/jpeg;base64,abc123')).toBe('jpeg');
      expect(getBase64ImageType('data:image/svg+xml;base64,abc123')).toBe('svg+xml');
      expect(getBase64ImageType('invalid string')).toBe('unknown');
    });
  });

  describe('getBase64ImageSize', () => {
    it('calculates correct size for base64 image', () => {
      // "YWJjZGVmZ2g=" decodes to "abcdefgh" (8 bytes).
      expect(getBase64ImageSize('data:image/png;base64,YWJjZGVmZ2g=')).toBe(8);
    });

    it('returns 0 for a data URI with no payload', () => {
      expect(getBase64ImageSize('data:image/png;base64,')).toBe(0);
    });
  });

  describe('getImageDimensions', () => {
    it('returns correct dimensions for an image', () => {
      const img = document.querySelector('img') as HTMLImageElement;
      expect(getImageDimensions(img)).toEqual({ width: 100, height: 100 });
    });
  });

  describe('getImageType', () => {
    it('determines correct image type from URL', () => {
      expect(getImageType('image.jpg')).toBe('jpeg');
      expect(getImageType('icon.png')).toBe('png');
      expect(getImageType('animation.gif')).toBe('gif');
      expect(getImageType('vector.svg')).toBe('svg');
      expect(getImageType('image.webp')).toBe('webp');
      expect(getImageType('photo.avif')).toBe('avif');
      expect(getImageType('file.txt')).toBe('unknown');
    });

    it('ignores query strings and fragments', () => {
      expect(getImageType('https://cdn.example.com/photo.jpg?w=800&h=600')).toBe('jpeg');
      expect(getImageType('https://cdn.example.com/photo.png#frag')).toBe('png');
    });

    it('returns "unknown" for extensionless URLs', () => {
      expect(getImageType('https://example.com/image')).toBe('unknown');
      expect(getImageType('https://example.com/')).toBe('unknown');
    });
  });

  describe('resolveUrl', () => {
    it('resolves relative URLs against the document base', () => {
      expect(resolveUrl('foo/bar.png')).toBe(abs('foo/bar.png'));
    });

    it('leaves data URIs unchanged', () => {
      expect(resolveUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    });
  });

  describe('parseSrcset', () => {
    it('correctly parses a descriptor srcset string', () => {
      const srcset = 'image-1x.png 1x, image-2x.png 2x, image-3x.png 3x';
      expect(parseSrcset(srcset)).toEqual(['image-1x.png', 'image-2x.png', 'image-3x.png']);
    });

    it('keeps commas inside a data: URI intact', () => {
      const srcset = 'data:image/png;base64,AAAA 1x, real.png 2x';
      expect(parseSrcset(srcset)).toEqual(['data:image/png;base64,AAAA', 'real.png']);
    });

    it('keeps commas inside a query string intact', () => {
      const srcset = 'photo.jpg?a=1,2 1x, other.jpg 2x';
      expect(parseSrcset(srcset)).toEqual(['photo.jpg?a=1,2', 'other.jpg']);
    });
  });

  describe('collectMedia', () => {
    it('collects all images including srcset and background images', () => {
      const images = collectMedia();

      // 5 unique <img>/<picture> sources + 2 srcset + 2 picture source srcset + 1 background
      expect(images).toHaveLength(9);

      const bySrc = Object.fromEntries(images.map((i) => [i.src, i]));
      expect(bySrc[abs('test1.jpg')]).toMatchObject({ type: 'jpeg', width: 100, height: 100, isBase64: false });
      expect(bySrc[abs('test2-large.png')]).toMatchObject({ type: 'png', isBase64: false });
      expect(bySrc[abs('test3-wide.webp')]).toMatchObject({ type: 'webp' });
      expect(bySrc[abs('test4.gif')]).toMatchObject({ type: 'gif' });
    });

    it('reports remote file sizes as unknown (0) — no network requests', () => {
      const images = collectMedia();
      const remote = images.filter((i) => !i.isBase64);
      expect(remote.length).toBeGreaterThan(0);
      remote.forEach((img) => expect(img.fileSize).toBe(0));
    });

    it('computes base64 image sizes locally', () => {
      const images = collectMedia();
      const base64 = images.find((i) => i.isBase64);
      expect(base64).toBeDefined();
      expect(base64?.fileSize).toBeGreaterThan(0);
      expect(base64?.type).toBe('png');
    });

    it('resolves relative sources to absolute URLs', () => {
      const images = collectMedia();
      expect(images.find((i) => i.src === abs('test1.jpg'))).toBeDefined();
      expect(images.find((i) => i.src === abs('test2-small.png'))).toBeDefined();
    });

    it('does not collect duplicate images', () => {
      document.body.innerHTML += `<img src="test1.jpg" alt="Duplicate Test 1">`;
      const images = collectMedia();
      expect(images.filter((img) => img.src === abs('test1.jpg'))).toHaveLength(1);
    });
  });

  describe('Message Handling', () => {
    it('responds with collected images when GET_IMAGES message is received', () => {
      const sendResponse = jest.fn();
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      messageListener('GET_IMAGES', {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ src: abs('test1.jpg') }),
          expect.objectContaining({ src: abs('test2.png') }),
          expect.objectContaining({ src: abs('test2-small.png') }),
          expect.objectContaining({ src: abs('test4.gif') }),
        ]),
      );
    });

    it('does not respond to unknown message types', () => {
      const sendResponse = jest.fn();
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      messageListener('UNKNOWN_MESSAGE', {}, sendResponse);

      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid base64 data gracefully', () => {
      document.body.innerHTML += `<img src="data:image/png;base64,invalid" alt="Invalid Base64">`;
      const images = collectMedia();
      const invalid = images.find((img) => img.alt === 'Invalid Base64');
      expect(invalid).toBeDefined();
      expect(invalid?.type).toBe('png');
      expect(invalid?.fileSize).toBeGreaterThanOrEqual(0);
    });

    it('handles images with query parameters in URL', () => {
      document.body.innerHTML += `<img src="image.jpg?width=100&height=100" alt="Image with query params">`;
      const images = collectMedia();
      const withParams = images.find((img) => img.src.includes('image.jpg?width=100'));
      expect(withParams).toBeDefined();
      expect(withParams?.type).toBe('jpeg');
    });

    it('handles data URIs for non-image types', () => {
      document.body.innerHTML += `<img src="data:text/plain;base64,SGVsbG8gV29ybGQ=" alt="Non-image data URI">`;
      const images = collectMedia();
      const nonImage = images.find((img) => img.alt === 'Non-image data URI');
      expect(nonImage).toBeDefined();
      expect(nonImage?.type).toBe('unknown');
    });
  });

  describe('CSS Background Images', () => {
    it('captures single and multiple background images', () => {
      document.body.innerHTML += `<div style="background-image: url('bg1.png'), url('bg2.png');"></div>`;
      const images = collectMedia();
      expect(images.find((i) => i.src === abs('test4.gif'))).toBeDefined();
      expect(images.find((i) => i.src === abs('bg1.png'))).toBeDefined();
      expect(images.find((i) => i.src === abs('bg2.png'))).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('captures alt text, and defaults to empty string when absent', () => {
      document.body.innerHTML += `<img src="no-alt.jpg">`;
      const images = collectMedia();
      expect(images.find((i) => i.src === abs('test1.jpg'))?.alt).toBe('Test 1');
      expect(images.find((i) => i.src === abs('no-alt.jpg'))?.alt).toBe('');
    });
  });

  describe('parseSrcset edge cases', () => {
    it('returns an empty array for empty or whitespace input', () => {
      expect(parseSrcset('')).toEqual([]);
      expect(parseSrcset('   ')).toEqual([]);
    });

    it('tolerates a trailing comma', () => {
      expect(parseSrcset('a.jpg 1x,')).toEqual(['a.jpg']);
    });

    it('handles protocol-relative URLs', () => {
      expect(parseSrcset('//cdn.example.com/x.jpg 2x, b.jpg')).toEqual([
        '//cdn.example.com/x.jpg',
        'b.jpg',
      ]);
    });

    it('collapses extra whitespace between url and descriptor', () => {
      expect(parseSrcset('a.jpg    2x')).toEqual(['a.jpg']);
    });
  });

  describe('getImageType edge cases', () => {
    it('is case-insensitive', () => {
      expect(getImageType('PHOTO.JPG')).toBe('jpeg');
      expect(getImageType('https://x/A.JPEG?y=1')).toBe('jpeg');
    });

    it('uses only the final extension', () => {
      expect(getImageType('archive.tar.gz')).toBe('unknown');
      expect(getImageType('sprite.png')).toBe('png');
    });
  });

  describe('getBase64ImageType / size edge cases', () => {
    it('extracts a compound mime subtype', () => {
      expect(getBase64ImageType('data:image/svg+xml;charset=utf-8;base64,PD8=')).toBe('svg+xml');
    });

    it('sizes a single-byte payload with padding', () => {
      expect(getBase64ImageSize('data:image/png;base64,YQ==')).toBe(1);
    });

    it('returns 0 when there is no comma-separated payload', () => {
      expect(getBase64ImageSize('not-a-data-uri')).toBe(0);
    });
  });

  describe('resolveUrl edge cases', () => {
    it('resolves protocol-relative URLs using the document scheme', () => {
      expect(resolveUrl('//cdn.example.com/x.png')).toBe('http://cdn.example.com/x.png');
    });

    it('returns the input unchanged when it cannot be parsed', () => {
      // Absolute URL with an invalid host — throws even with a base.
      expect(resolveUrl('http://[')).toBe('http://[');
    });
  });

  describe('collectMedia edge cases', () => {
    it('parses single, double, and unquoted background-image URLs', () => {
      document.body.innerHTML =
        `<div style="background-image: url(&quot;q.png&quot;), url('r.png'), url(s.png);"></div>`;
      const srcs = collectMedia().map((i) => i.src);
      expect(srcs).toEqual(
        expect.arrayContaining([abs('q.png'), abs('r.png'), abs('s.png')]),
      );
    });

    it('ignores background-image: none', () => {
      document.body.innerHTML = '<div style="background-image: none"></div>';
      expect(collectMedia()).toHaveLength(0);
    });

    it('deduplicates the same resolved URL across <img> and background', () => {
      document.body.innerHTML =
        '<img src="shared.png"><div style="background-image: url(shared.png)"></div>';
      expect(collectMedia().filter((i) => i.src === abs('shared.png'))).toHaveLength(1);
    });

    it('collects blob: URLs with an unknown type', () => {
      document.body.innerHTML = '<img src="blob:https://example.com/abc-123">';
      const blob = collectMedia().find((i) => i.src.startsWith('blob:'));
      expect(blob).toBeDefined();
      expect(blob?.type).toBe('unknown');
    });
  });

  describe('Performance', () => {
    it('handles a large number of images efficiently', () => {
      for (let i = 0; i < 1000; i++) {
        document.body.innerHTML += `<img src="test${i}.jpg" alt="Test ${i}">`;
      }
      const start = performance.now();
      const images = collectMedia();
      const elapsed = performance.now() - start;
      expect(images.length).toBeGreaterThan(1000);
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
