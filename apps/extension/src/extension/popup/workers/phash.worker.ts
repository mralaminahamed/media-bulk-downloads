/**
 * Perceptual-hash worker (#198). Decodes an image's bytes off the main thread and
 * returns its DCT pHash, so hashing a large collected set never janks the popup.
 *
 * The popup fetches each image's bytes (extension-origin fetch bypasses page CORS,
 * the proven path) and transfers the ArrayBuffer here zero-copy. This worker only
 * decodes + downscales + hashes — it never touches the network, sidestepping any
 * question of host-permission fetches from a spawned worker, and never taints a
 * canvas (it decodes from a Blob, not a cross-origin <img>).
 */
import { computePHash } from '@mbd/core/collection/phash';

/** Popup → worker: hash the image whose bytes are transferred in. */
export interface HashRequest {
  type: 'HASH';
  /** Correlation id echoed back on the response (the item's src). */
  id: string;
  bytes: ArrayBuffer;
}

/** Worker → popup: either the hash, or a decode failure (skip that item). */
export type HashResponse = { type: 'HASHED'; id: string; pHash: string } | { type: 'HASH_ERROR'; id: string };

const SIZE = 32; // the edge computePHash expects

const ctx = new OffscreenCanvas(SIZE, SIZE).getContext('2d', { willReadFrequently: true });

// The dedicated-worker global. Typed structurally (not via the ambient
// DedicatedWorkerGlobalScope name, which the app tsconfig's DOM lib doesn't load).
const workerScope = self as unknown as {
  postMessage: (msg: HashResponse) => void;
  onmessage: ((e: MessageEvent<HashRequest>) => void) | null;
};

const post = (msg: HashResponse): void => workerScope.postMessage(msg);

workerScope.onmessage = async (e: MessageEvent<HashRequest>): Promise<void> => {
  const { id, bytes } = e.data;
  try {
    if (!ctx) throw new Error('no 2d context');
    const bitmap = await createImageBitmap(new Blob([bytes]));
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bitmap, 0, 0, SIZE, SIZE); // downscale to 32×32
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE); // RGBA, length 32·32·4
    const gray = new Array<number>(SIZE * SIZE);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      // Rec. 601 luma — the standard grayscale weighting for perceptual hashing.
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    post({ type: 'HASHED', id, pHash: computePHash(gray) });
  } catch {
    post({ type: 'HASH_ERROR', id });
  }
};
