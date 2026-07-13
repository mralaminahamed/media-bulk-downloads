import { describe, it, expect } from 'vitest';
import { readBounded, readBoundedText, StreamTooLargeError } from '@mbd/core/download/stream/bounded-fetch';

/** A Response whose body streams the given chunks; tracks how many were pulled. */
function streamRes(chunks: Uint8Array[]): { res: Response; pulled: () => number } {
  let i = 0;
  const res = {
    body: {
      getReader() {
        return {
          read: async () =>
            i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
          cancel: async () => {},
          releaseLock: () => {},
        };
      },
    },
  } as unknown as Response;
  return { res, pulled: () => i };
}

/** A Response with no readable body — exercises the arrayBuffer fallback. */
const bufferRes = (bytes: Uint8Array): Response =>
  ({ body: null, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as Response);

describe('readBounded', () => {
  it('concatenates streamed chunks that stay under the cap', async () => {
    const { res } = streamRes([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(Array.from(await readBounded(res, 10))).toEqual([1, 2, 3]);
  });

  it('aborts mid-stream once the running total exceeds the cap (never reads past it)', async () => {
    // 4-byte chunks, cap 6: chunk 1 → 4 (ok), chunk 2 → 8 (> 6, throw). The 3rd is never pulled.
    const { res, pulled } = streamRes([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)]);
    await expect(readBounded(res, 6)).rejects.toBeInstanceOf(StreamTooLargeError);
    expect(pulled()).toBe(2); // stopped after the chunk that blew the cap — didn't materialize the rest
  });

  it('falls back to arrayBuffer when there is no readable body, still size-checked', async () => {
    expect(Array.from(await readBounded(bufferRes(new Uint8Array([9, 9])), 10))).toEqual([9, 9]);
    await expect(readBounded(bufferRes(new Uint8Array(20)), 10)).rejects.toBeInstanceOf(StreamTooLargeError);
  });
});

describe('readBoundedText', () => {
  it('decodes bounded bytes to text', async () => {
    expect(await readBoundedText(bufferRes(new TextEncoder().encode('#EXTM3U')), 100)).toBe('#EXTM3U');
  });

  it('rejects an oversized manifest instead of materializing it', async () => {
    await expect(readBoundedText(bufferRes(new Uint8Array(50)), 10)).rejects.toBeInstanceOf(StreamTooLargeError);
  });
});
