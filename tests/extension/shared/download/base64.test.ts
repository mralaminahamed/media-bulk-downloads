import { u8ToBase64, base64ToU8 } from '@/extension/shared/download/base64';

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
