import type { Mock, MockInstance } from 'vitest';
// The relay listeners forward sniffer payloads into these resolver functions.
// Spy on just those two entry points (keep the rest of each module real so the
// collectMedia tests, which pull sniffedHlsManifests / instagramPageMedia from
// the same modules, are unaffected).
vi.mock('@/extension/shared/resolvers/sites/instagram', async () => ({
  ...(await vi.importActual<typeof import('@/extension/shared/resolvers/sites/instagram')>('@/extension/shared/resolvers/sites/instagram')),
  ingestSniffedIgMedia: vi.fn(),
}));
vi.mock('@/extension/shared/resolvers/sniffers/hls-sniff', async () => ({
  ...(await vi.importActual<typeof import('@/extension/shared/resolvers/sniffers/hls-sniff')>('@/extension/shared/resolvers/sniffers/hls-sniff')),
  ingestSniffedHls: vi.fn(),
}));
// The deep-scan runner is a heavy DOM-scrolling driver; the content script only
// wires its lifecycle (start / abort / respond), so stub the runner itself.
vi.mock('@/extension/content/deepScanRunner', () => ({
  startDeepScan: vi.fn(),
}));

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
    it('correctly identifies base64 images', async () => {
      expect(isBase64Image('data:image/png;base64,abc123')).toBe(true);
      expect(isBase64Image('https://example.com/image.png')).toBe(false);
    });
  });

  describe('getBase64ImageType', () => {
    it('extracts correct image type from base64 string', async () => {
      expect(getBase64ImageType('data:image/png;base64,abc123')).toBe('png');
      expect(getBase64ImageType('data:image/jpeg;base64,abc123')).toBe('jpeg');
      // svg+xml is normalised to the 'svg' that getImageType emits for .svg files,
      // so the toolbar's imageType='svg' filter matches base64/inline SVGs.
      expect(getBase64ImageType('data:image/svg+xml;base64,abc123')).toBe('svg');
      // Inline (URL-encoded, no `;base64`) data URIs end the subtype at the comma.
      expect(getBase64ImageType('data:image/svg+xml,%3Csvg%3E')).toBe('svg');
      expect(getBase64ImageType('data:image/png,rawbytes')).toBe('png');
      expect(getBase64ImageType('invalid string')).toBe('unknown');
    });
  });

  describe('getBase64ImageSize', () => {
    it('calculates correct size for base64 image', async () => {
      // "YWJjZGVmZ2g=" decodes to "abcdefgh" (8 bytes).
      expect(getBase64ImageSize('data:image/png;base64,YWJjZGVmZ2g=')).toBe(8);
    });

    it('returns 0 for a data URI with no payload', async () => {
      expect(getBase64ImageSize('data:image/png;base64,')).toBe(0);
    });

    it('returns 0 for a URL-encoded (non-base64) data URI with commas in its payload', async () => {
      // Not base64: split(',')[1] would be the truncated "0" and the length
      // formula meaningless. The `;base64` guard must reject it.
      expect(getBase64ImageSize('data:image/svg+xml,<svg viewBox="0,0,8,8"></svg>')).toBe(0);
      expect(getBase64ImageSize('data:image/svg+xml;charset=utf-8,<svg></svg>')).toBe(0);
    });
  });

  describe('getImageDimensions', () => {
    it('returns correct dimensions for an image', async () => {
      const img = document.querySelector('img') as HTMLImageElement;
      expect(getImageDimensions(img)).toEqual({ width: 100, height: 100 });
    });
  });

  describe('getImageType', () => {
    it('determines correct image type from URL', async () => {
      expect(getImageType('image.jpg')).toBe('jpeg');
      expect(getImageType('icon.png')).toBe('png');
      expect(getImageType('animation.gif')).toBe('gif');
      expect(getImageType('vector.svg')).toBe('svg');
      expect(getImageType('image.webp')).toBe('webp');
      expect(getImageType('photo.avif')).toBe('avif');
      expect(getImageType('file.txt')).toBe('unknown');
    });

    it('ignores query strings and fragments', async () => {
      expect(getImageType('https://cdn.example.com/photo.jpg?w=800&h=600')).toBe('jpeg');
      expect(getImageType('https://cdn.example.com/photo.png#frag')).toBe('png');
    });

    it('returns "unknown" for extensionless URLs', async () => {
      expect(getImageType('https://example.com/image')).toBe('unknown');
      expect(getImageType('https://example.com/')).toBe('unknown');
    });
  });

  describe('resolveUrl', () => {
    it('resolves relative URLs against the document base', async () => {
      expect(resolveUrl('foo/bar.png')).toBe(abs('foo/bar.png'));
    });

    it('leaves data URIs unchanged', async () => {
      expect(resolveUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    });
  });

  describe('parseSrcset', () => {
    it('correctly parses a descriptor srcset string', async () => {
      const srcset = 'image-1x.png 1x, image-2x.png 2x, image-3x.png 3x';
      expect(parseSrcset(srcset)).toEqual(['image-1x.png', 'image-2x.png', 'image-3x.png']);
    });

    it('keeps commas inside a data: URI intact', async () => {
      const srcset = 'data:image/png;base64,AAAA 1x, real.png 2x';
      expect(parseSrcset(srcset)).toEqual(['data:image/png;base64,AAAA', 'real.png']);
    });

    it('keeps commas inside a query string intact', async () => {
      const srcset = 'photo.jpg?a=1,2 1x, other.jpg 2x';
      expect(parseSrcset(srcset)).toEqual(['photo.jpg?a=1,2', 'other.jpg']);
    });
  });

  describe('collectMedia', () => {
    it('collects all images including srcset and background images', async () => {
      const images = collectMedia();

      // 5 unique <img>/<picture> sources + 2 srcset + 2 picture source srcset + 1 background
      expect(images).toHaveLength(9);

      const bySrc = Object.fromEntries(images.map((i) => [i.src, i]));
      expect(bySrc[abs('test1.jpg')]).toMatchObject({ type: 'jpeg', width: 100, height: 100, isBase64: false });
      expect(bySrc[abs('test2-large.png')]).toMatchObject({ type: 'png', isBase64: false });
      expect(bySrc[abs('test3-wide.webp')]).toMatchObject({ type: 'webp' });
      expect(bySrc[abs('test4.gif')]).toMatchObject({ type: 'gif' });
    });

    it('reports remote file sizes as unknown (0) — no network requests', async () => {
      const images = collectMedia();
      const remote = images.filter((i) => !i.isBase64);
      expect(remote.length).toBeGreaterThan(0);
      remote.forEach((img) => expect(img.fileSize).toBe(0));
    });

    it('computes base64 image sizes locally', async () => {
      const images = collectMedia();
      const base64 = images.find((i) => i.isBase64);
      expect(base64).toBeDefined();
      expect(base64?.fileSize).toBeGreaterThan(0);
      expect(base64?.type).toBe('png');
    });

    it('resolves relative sources to absolute URLs', async () => {
      const images = collectMedia();
      expect(images.find((i) => i.src === abs('test1.jpg'))).toBeDefined();
      expect(images.find((i) => i.src === abs('test2-small.png'))).toBeDefined();
    });

    it('does not collect duplicate images', async () => {
      document.body.innerHTML += `<img src="test1.jpg" alt="Duplicate Test 1">`;
      const images = collectMedia();
      expect(images.filter((img) => img.src === abs('test1.jpg'))).toHaveLength(1);
    });
  });

  describe('Message Handling', () => {
    it('responds with collected images when GET_IMAGES message is received', async () => {
      // GET_IMAGES now reads the smartPageDefaults setting (Task C4) before
      // responding, so the channel is kept open for an async chrome.storage.sync
      // read — mock it to invoke its callback synchronously, mirroring the
      // deep-scan handler's async storage read further down this file.
      (chrome.storage.sync.get as Mock).mockImplementation(
        (_keys: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: {} }),
      );
      const sendResponse = vi.fn();
      const messageListener = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const ret = messageListener('GET_IMAGES', {}, sendResponse);
      expect(ret).toBe(true); // keeps the message channel open for the async reply

      expect(sendResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ src: abs('test1.jpg') }),
          expect.objectContaining({ src: abs('test2.png') }),
          expect.objectContaining({ src: abs('test2-small.png') }),
          expect.objectContaining({ src: abs('test4.gif') }),
        ]),
      );

      (chrome.storage.sync.get as Mock).mockReset();
    });

    it('does not respond to unknown message types', async () => {
      const sendResponse = vi.fn();
      const messageListener = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      messageListener('UNKNOWN_MESSAGE', {}, sendResponse);

      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('responds with the classified page type when GET_PAGE_TYPE message is received', async () => {
      // 6 equal-sized images inside <article>, no feed markers: imageCount > 5
      // rules out single-media, imageCount < 20 rules out gallery, feedMarkers
      // is false so feed never applies — hasArticle is the only signal left,
      // so this fixture classifies unambiguously as 'article'.
      document.body.innerHTML =
        '<article>' + '<img src="a.jpg" width="100" height="100">'.repeat(6) + '</article>';
      const sendResponse = vi.fn();
      const messageListener = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      messageListener('GET_PAGE_TYPE', {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith('article');
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid base64 data gracefully', async () => {
      document.body.innerHTML += `<img src="data:image/png;base64,invalid" alt="Invalid Base64">`;
      const images = collectMedia();
      const invalid = images.find((img) => img.alt === 'Invalid Base64');
      expect(invalid).toBeDefined();
      expect(invalid?.type).toBe('png');
      expect(invalid?.fileSize).toBeGreaterThanOrEqual(0);
    });

    it('handles images with query parameters in URL', async () => {
      document.body.innerHTML += `<img src="image.jpg?width=100&height=100" alt="Image with query params">`;
      const images = collectMedia();
      const withParams = images.find((img) => img.src.includes('image.jpg?width=100'));
      expect(withParams).toBeDefined();
      expect(withParams?.type).toBe('jpeg');
    });

    it('drops non-image data URIs (not media, and a data:text/* is a scheme risk)', async () => {
      document.body.innerHTML += `<img src="data:text/plain;base64,SGVsbG8gV29ybGQ=" alt="Non-image data URI">`;
      const images = collectMedia();
      expect(images.find((img) => img.alt === 'Non-image data URI')).toBeUndefined();
    });

    it('drops <img> whose src carries a dangerous or non-http scheme (javascript:/file:)', async () => {
      // Only http(s) and data:image ever become candidates. A javascript: src can
      // never be a media file, and file: would read the local disk — neither must
      // survive into MediaItem.src (which flows to <a href> / chrome.downloads).
      document.body.innerHTML += `
        <img src="javascript:alert(1)" alt="js-scheme">
        <img src="file:///etc/passwd" alt="file-scheme">
      `;
      const images = collectMedia();
      expect(images.some((i) => i.alt === 'js-scheme')).toBe(false);
      expect(images.some((i) => i.alt === 'file-scheme')).toBe(false);
      expect(images.some((i) => i.src.startsWith('javascript:'))).toBe(false);
      expect(images.some((i) => i.src.startsWith('file:'))).toBe(false);
    });
  });

  describe('CSS Background Images', () => {
    it('captures single and multiple background images', async () => {
      document.body.innerHTML += `<div style="background-image: url('bg1.png'), url('bg2.png');"></div>`;
      const images = collectMedia();
      expect(images.find((i) => i.src === abs('test4.gif'))).toBeDefined();
      expect(images.find((i) => i.src === abs('bg1.png'))).toBeDefined();
      expect(images.find((i) => i.src === abs('bg2.png'))).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('captures alt text, and defaults to empty string when absent', async () => {
      document.body.innerHTML += `<img src="no-alt.jpg">`;
      const images = collectMedia();
      expect(images.find((i) => i.src === abs('test1.jpg'))?.alt).toBe('Test 1');
      expect(images.find((i) => i.src === abs('no-alt.jpg'))?.alt).toBe('');
    });
  });

  describe('parseSrcset edge cases', () => {
    it('returns an empty array for empty or whitespace input', async () => {
      expect(parseSrcset('')).toEqual([]);
      expect(parseSrcset('   ')).toEqual([]);
    });

    it('tolerates a trailing comma', async () => {
      expect(parseSrcset('a.jpg 1x,')).toEqual(['a.jpg']);
    });

    it('handles protocol-relative URLs', async () => {
      expect(parseSrcset('//cdn.example.com/x.jpg 2x, b.jpg')).toEqual([
        '//cdn.example.com/x.jpg',
        'b.jpg',
      ]);
    });

    it('collapses extra whitespace between url and descriptor', async () => {
      expect(parseSrcset('a.jpg    2x')).toEqual(['a.jpg']);
    });
  });

  describe('getImageType edge cases', () => {
    it('is case-insensitive', async () => {
      expect(getImageType('PHOTO.JPG')).toBe('jpeg');
      expect(getImageType('https://x/A.JPEG?y=1')).toBe('jpeg');
    });

    it('uses only the final extension', async () => {
      expect(getImageType('archive.tar.gz')).toBe('unknown');
      expect(getImageType('sprite.png')).toBe('png');
    });
  });

  describe('getBase64ImageType / size edge cases', () => {
    it('extracts a compound mime subtype and normalises svg+xml to svg', async () => {
      expect(getBase64ImageType('data:image/svg+xml;charset=utf-8;base64,PD8=')).toBe('svg');
    });

    it('sizes a single-byte payload with padding', async () => {
      expect(getBase64ImageSize('data:image/png;base64,YQ==')).toBe(1);
    });

    it('returns 0 when there is no comma-separated payload', async () => {
      expect(getBase64ImageSize('not-a-data-uri')).toBe(0);
    });
  });

  describe('resolveUrl edge cases', () => {
    it('resolves protocol-relative URLs using the document scheme', async () => {
      expect(resolveUrl('//cdn.example.com/x.png')).toBe('http://cdn.example.com/x.png');
    });

    it('returns the input unchanged when it cannot be parsed', async () => {
      // Absolute URL with an invalid host — throws even with a base.
      expect(resolveUrl('http://[')).toBe('http://[');
    });
  });

  describe('collectMedia edge cases', () => {
    it('parses single, double, and unquoted background-image URLs', async () => {
      document.body.innerHTML =
        `<div style="background-image: url(&quot;q.png&quot;), url('r.png'), url(s.png);"></div>`;
      const srcs = collectMedia().map((i) => i.src);
      expect(srcs).toEqual(
        expect.arrayContaining([abs('q.png'), abs('r.png'), abs('s.png')]),
      );
    });

    it('ignores background-image: none', async () => {
      document.body.innerHTML = '<div style="background-image: none"></div>';
      expect(collectMedia()).toHaveLength(0);
    });

    it('deduplicates the same resolved URL across <img> and background', async () => {
      document.body.innerHTML =
        '<img src="shared.png"><div style="background-image: url(shared.png)"></div>';
      expect(collectMedia().filter((i) => i.src === abs('shared.png'))).toHaveLength(1);
    });

    it('drops blob: image URLs (not fetchable by chrome.downloads from the extension)', async () => {
      document.body.innerHTML = '<img src="blob:https://example.com/abc-123">';
      expect(collectMedia().some((i) => i.src.startsWith('blob:'))).toBe(false);
    });

    it('tolerates an iframe whose contentDocument access throws (cross-origin) and still collects the rest', async () => {
      document.body.innerHTML = '<img src="visible.jpg"><iframe id="f"></iframe>';
      const iframe = document.getElementById('f') as HTMLIFrameElement;
      // A cross-origin frame throws on contentDocument access; the walk must catch
      // it, treat the frame as unreachable, and keep collecting the top document.
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        get() { throw new Error('cross-origin frame'); },
      });
      // jsdom's own getComputedStyle → selector matcher reads iframe.contentDocument
      // (focusability check); stub it so the ONLY access is collect's explicit,
      // guarded one — which is the branch under test.
      const styleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockReturnValue({ getPropertyValue: () => 'none' } as unknown as CSSStyleDeclaration);
      try {
        const srcs = collectMedia().map((i) => i.src);
        expect(srcs).toContain(abs('visible.jpg'));
      } finally {
        styleSpy.mockRestore();
      }
    });
  });

  describe('Performance', () => {
    it('handles a large number of images efficiently', async () => {
      // Build the markup once and parse it in a single innerHTML assignment;
      // `+=` in a loop re-parses the whole body each pass (O(n²) — seconds under
      // jsdom) and isn't what this test measures.
      let html = '';
      for (let i = 0; i < 1000; i++) html += `<img src="test${i}.jpg" alt="Test ${i}">`;
      document.body.innerHTML += html; // append once (keeps the beforeEach fixture imgs)
      const start = performance.now();
      const images = collectMedia();
      const elapsed = performance.now() - start;
      expect(images.length).toBeGreaterThan(1000);
      expect(elapsed).toBeLessThan(5000);
    });
  });
});

// ── Deep-scan lifecycle message handling ────────────────────────────────────
// index.ts registers a second runtime.onMessage listener that starts/aborts the
// deep scan and streams results back through sendResponse. Re-import fresh and
// grab that listener (the second one registered — the first answers GET_IMAGES).
describe('Deep scan message handling', () => {
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  interface Wired {
    handler: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
    startDeepScan: Mock;
  }

  const wire = async (): Promise<Wired> => {
    vi.resetModules();
    const startDeepScan = (await import('@/extension/content/deepScanRunner')).startDeepScan as unknown as Mock;
    startDeepScan.mockReset();
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_keys: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: {} }),
    );
    const addListener = chrome.runtime.onMessage.addListener as Mock;
    addListener.mockClear();

    await import('@/extension/content');

    // index.ts registers GET_IMAGES first, then the deep-scan listener second.
    const handler = addListener.mock.calls[1][0] as Wired['handler'];
    return { handler, startDeepScan };
  };

  afterEach(() => {
    (chrome.storage.sync.get as Mock).mockReset();
  });

  afterAll(() => {
    (chrome.runtime.onMessage.addListener as Mock).mockClear();
    vi.resetModules();
  });

  it('starts a deep scan and responds with the resolved media', async () => {
    const { handler, startDeepScan } = await wire();
    const media = [{ src: 'https://ex.com/a.jpg' }];
    startDeepScan.mockResolvedValue(media);

    const sendResponse = vi.fn();
    const ret = handler('DEEP_SCAN', {}, sendResponse);
    expect(ret).toBe(true); // keeps the message channel open for the async reply
    await flush();

    expect(startDeepScan).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(media);
  });

  it('responds with an empty list when the scan rejects', async () => {
    const { handler, startDeepScan } = await wire();
    startDeepScan.mockRejectedValue(new Error('boom'));

    const sendResponse = vi.fn();
    handler('DEEP_SCAN', {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith([]);
  });

  it('streams progress to the popup, including the stop reason', async () => {
    const { handler, startDeepScan } = await wire();
    (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue(undefined);
    // The runner reports progress via the onProgress callback the content script
    // supplies; that callback forwards a DEEP_SCAN_PROGRESS message to the popup.
    startDeepScan.mockImplementation((onProgress: (f: number, s: number, e: number, r?: string) => void) => {
      onProgress(12, 3, 450, 'maxItems');
      return Promise.resolve([]);
    });

    handler('DEEP_SCAN', {}, vi.fn());
    await flush();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'DEEP_SCAN_PROGRESS', found: 12, scrolls: 3, elapsedMs: 450, reason: 'maxItems',
    });
  });

  it('omits the reason field from an interim progress message', async () => {
    const { handler, startDeepScan } = await wire();
    (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue(undefined);
    startDeepScan.mockImplementation((onProgress: (f: number, s: number, e: number, r?: string) => void) => {
      onProgress(5, 1, 100); // no stop reason yet
      return Promise.resolve([]);
    });

    handler('DEEP_SCAN', {}, vi.fn());
    await flush();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'DEEP_SCAN_PROGRESS', found: 5, scrolls: 1, elapsedMs: 100,
    });
  });

  it('acknowledges a DEEP_SCAN_ABORT synchronously', async () => {
    const { handler } = await wire();
    const sendResponse = vi.fn();
    const ret = handler('DEEP_SCAN_ABORT', {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(true);
    expect(ret).toBeUndefined(); // synchronous — channel not held open
  });

  it('ignores unrelated messages on the deep-scan listener', async () => {
    const { handler, startDeepScan } = await wire();
    const sendResponse = vi.fn();
    const ret = handler('SOMETHING_ELSE', {}, sendResponse);
    expect(ret).toBeUndefined();
    expect(startDeepScan).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

// ── MAIN-world sniffer relay listeners (generic host) ───────────────────────
// index.ts registers its window 'message' relays at import time. The HLS relay
// runs on every host, so it is exercised here at the jsdom default location
// (localhost) — a host that is neither X nor Instagram, which also proves the
// host-gated X/IG relays are NOT wired off their platforms.
//
// jsdom's window.location is `[LegacyUnforgeable]` (immutable at runtime — it
// can neither be redefined nor reassigned to another origin), so the on-host X
// and IG relays are covered in sibling files that pin the location per file via
// `@vitest-environment-options` (relay-x.test.ts, relay-ig.test.ts).
describe('Sniffer relay listeners (generic host)', () => {
  type Handler = (event: unknown) => void;

  interface Loaded {
    messageHandlers: Handler[];
    postSpy: MockInstance;
    ingestSniffedIgMedia: Mock;
    ingestSniffedHls: Mock;
  }

  let postSpy: MockInstance | undefined;

  // Re-import the content module fresh and capture the exact window 'message'
  // handlers it registers, so assertions never depend on listeners left on
  // `window` by an earlier import (each handler is driven directly).
  const loadContent = async (): Promise<Loaded> => {
    vi.resetModules();
    const addSpy = vi.spyOn(window, 'addEventListener');
    postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockReset();
    sendMessage.mockReturnValue(Promise.resolve(undefined));

    await import('@/extension/content');

    const messageHandlers = addSpy.mock.calls
      .filter((c) => c[0] === 'message')
      .map((c) => c[1] as Handler);
    addSpy.mockRestore();

    const igMod = await import('@/extension/shared/resolvers/sites/instagram');
    const hlsMod = await import('@/extension/shared/resolvers/sniffers/hls-sniff');
    // vi.resetModules() re-imports the module graph but reuses the vi.mock
    // factory's fns (unlike jest.resetModules, which rebuilds them), so their
    // call history persists across loadContent() calls. Clear it per load.
    (igMod.ingestSniffedIgMedia as unknown as Mock).mockClear();
    (hlsMod.ingestSniffedHls as unknown as Mock).mockClear();
    return {
      messageHandlers,
      postSpy,
      ingestSniffedIgMedia: igMod.ingestSniffedIgMedia as unknown as Mock,
      ingestSniffedHls: hlsMod.ingestSniffedHls as unknown as Mock,
    };
  };

  const fire = (handlers: Handler[], event: unknown): void => handlers.forEach((h) => h(event));

  // Build the fields the relay listeners read off a MessageEvent. Defaults to a
  // same-window, same-origin envelope; `over` swaps in a foreign source/origin.
  const message = (data: unknown, over: { source?: unknown; origin?: string } = {}): unknown => ({
    source: 'source' in over ? over.source : window,
    origin: 'origin' in over ? over.origin : window.location.origin,
    data,
  });

  afterEach(() => {
    postSpy?.mockRestore();
    postSpy = undefined;
  });

  afterAll(() => {
    (chrome.runtime.sendMessage as Mock).mockReset();
    vi.resetModules();
  });

  describe('HLS relay', () => {
    it('feeds a valid ibd-hls envelope to ingestSniffedHls', async () => {
      const { messageHandlers, ingestSniffedHls } = await loadContent();
      const urls = ['https://cdn.example.com/live/index.m3u8'];
      fire(messageHandlers, message({ source: 'ibd-hls', urls }));
      expect(ingestSniffedHls).toHaveBeenCalledWith(urls);
    });

    it('ignores a foreign window source, a foreign origin, a wrong tag, and a non-array urls', async () => {
      const { messageHandlers, ingestSniffedHls } = await loadContent();
      fire(messageHandlers, message({ source: 'ibd-hls', urls: [] }, { source: {} }));
      fire(messageHandlers, message({ source: 'ibd-hls', urls: [] }, { origin: 'https://evil.example' }));
      fire(messageHandlers, message({ source: 'ibd-not-hls', urls: [] }));
      fire(messageHandlers, message({ source: 'ibd-hls', urls: 5 }));
      fire(messageHandlers, message(null));
      expect(ingestSniffedHls).not.toHaveBeenCalled();
    });

    it('posts ibd-hls-ready on registration so the sniffer replays earlier manifests', async () => {
      const { postSpy: spy } = await loadContent();
      expect(spy).toHaveBeenCalledWith({ source: 'ibd-hls-ready' }, window.location.origin);
    });
  });

  describe('host gating (neither X nor Instagram)', () => {
    it('wires only the HLS relay on a generic host', async () => {
      expect((await loadContent()).messageHandlers).toHaveLength(1);
    });

    it('does not forward a valid X envelope (X relay not wired here)', async () => {
      const { messageHandlers } = await loadContent();
      fire(messageHandlers, message({ source: 'ibd-x-media', pairs: [{ url: 'https://video.twimg.com/z.mp4' }] }));
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('does not forward a valid IG envelope (IG relay not wired here)', async () => {
      const { messageHandlers, ingestSniffedIgMedia } = await loadContent();
      fire(messageHandlers, message({ source: 'ibd-ig-media', entries: [{ code: 'ABC', kind: 'image', url: 'u' }] }));
      expect(ingestSniffedIgMedia).not.toHaveBeenCalled();
    });
  });
});
