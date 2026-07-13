import { u8ToBase64, base64ToU8, textToBase64 } from '@mbd/core/download/base64';

describe('base64 <-> Uint8Array', () => {
  it('encodes a known byte vector (ZIP magic "PK\\x03\\x04")', () => {
    expect(u8ToBase64(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('UEsDBA==');
  });

  it('round-trips an empty array', () => {
    expect(u8ToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToU8('')).toEqual(new Uint8Array(0));
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 255]);
    expect(base64ToU8(u8ToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips a large array across the 0x8000 chunk boundary', () => {
    // Exceeds the 32k-arg fromCharCode chunk so the chunking path is exercised.
    const bytes = new Uint8Array(0x8000 * 2 + 123);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(base64ToU8(u8ToBase64(bytes))).toEqual(bytes);
  });
});

describe('textToBase64', () => {
  it('encodes ASCII', () => {
    expect(textToBase64('https://a\nhttps://b')).toBe(btoa('https://a\nhttps://b'));
  });
  it('UTF-8-encodes non-ASCII so it decodes back correctly', () => {
    const text = 'café — 日本語 — 🎧';
    const decoded = decodeURIComponent(
      Array.from(atob(textToBase64(text)))
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    expect(decoded).toBe(text);
  });
});
