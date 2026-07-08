// @vitest-environment node
import { createCipheriv, randomBytes } from 'crypto';
import { browserHlsDeps, webcryptoDecrypt } from '@/extension/shared/download/hls-webcrypto';

// Runs in the node environment (not jsdom): jsdom is a separate JS realm, and
// Node 20's webcrypto rejects a cross-realm typed array (ERR_INVALID_ARG_TYPE)
// handed to importKey. Under node env the typed arrays are Node-realm and
// globalThis.crypto is Node's real WebCrypto, so the AES-CBC path runs on every
// supported Node version. This file exercises only crypto + global fetch (no
// DOM), so it needs nothing jsdom provides.

/** AES-128-CBC + PKCS7 encrypt via node:crypto — the exact scheme HLS uses. */
function aesCbcEncrypt(key: Uint8Array, iv: Uint8Array, plain: Uint8Array): Uint8Array {
  const c = createCipheriv('aes-128-cbc', key, iv);
  return new Uint8Array(Buffer.concat([c.update(plain), c.final()]));
}

describe('webcryptoDecrypt', () => {
  const key = new Uint8Array(randomBytes(16));
  const iv = new Uint8Array(randomBytes(16));
  const plain = new Uint8Array(Buffer.from('a real HLS TS segment payload, longer than one AES block'));

  it('round-trips AES-128-CBC and strips PKCS7 padding', async () => {
    const ct = aesCbcEncrypt(key, iv, plain);
    const out = await webcryptoDecrypt(key, iv, ct);
    expect(Buffer.from(out).equals(Buffer.from(plain))).toBe(true);
  });

  it('decrypts a ciphertext passed as a byteOffset view (buf() must slice, not take the whole backing buffer)', async () => {
    const ct = aesCbcEncrypt(key, iv, plain);
    // Place the ciphertext at offset 8 inside a larger buffer and hand a subarray
    // view (byteOffset = 8). If buf() ignored the offset it would decrypt the
    // wrong bytes and either throw or return garbage.
    const backing = new Uint8Array(8 + ct.length + 5);
    backing.set(ct, 8);
    const view = backing.subarray(8, 8 + ct.length);
    expect(view.byteOffset).toBe(8);
    const out = await webcryptoDecrypt(key, iv, view);
    expect(Buffer.from(out).equals(Buffer.from(plain))).toBe(true);
  });

  it('rejects when the key is wrong (bad PKCS7 padding)', async () => {
    const ct = aesCbcEncrypt(key, iv, plain);
    await expect(webcryptoDecrypt(new Uint8Array(randomBytes(16)), iv, ct)).rejects.toBeDefined();
  });
});

describe('browserHlsDeps', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
  });

  it('fetchText returns the body and throws with the status on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('#EXTM3U') }) as unknown as typeof fetch;
    await expect(browserHlsDeps().fetchText('https://x/m.m3u8')).resolves.toBe('#EXTM3U');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(browserHlsDeps().fetchText('https://x/m.m3u8')).rejects.toThrow(/404/);
  });

  it('fetchBytes issues a Range header, accepts a 206, and returns the bytes', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 206, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });
    global.fetch = f as unknown as typeof fetch;
    const out = await browserHlsDeps().fetchBytes('https://x/seg', { offset: 100, length: 50 });
    expect(f).toHaveBeenCalledWith('https://x/seg', { headers: { Range: 'bytes=100-149' } });
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('fetchBytes without a range issues a plain GET and throws on a real error status', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([9]).buffer) });
    global.fetch = f as unknown as typeof fetch;
    expect(Array.from(await browserHlsDeps().fetchBytes('https://x/seg'))).toEqual([9]);
    expect(f).toHaveBeenCalledWith('https://x/seg', undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(browserHlsDeps().fetchBytes('https://x/seg')).rejects.toThrow(/500/);
  });

  it('wires decrypt to webcryptoDecrypt and passes through concurrency + onProgress', () => {
    const onProgress = vi.fn();
    const deps = browserHlsDeps(onProgress);
    expect(deps.decrypt).toBe(webcryptoDecrypt);
    expect(deps.concurrency).toBe(6);
    expect(deps.onProgress).toBe(onProgress);
  });
});
