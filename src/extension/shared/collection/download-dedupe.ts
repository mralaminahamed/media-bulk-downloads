import { ImageInfo } from '@/types';
import { SrcKeySet } from './canonical';

/**
 * De-duplication for downloads. Two independent concerns:
 *  - partitionByDownloaded: drop images whose file is already on disk (skip
 *    re-saving the same image), matched by canonical src key.
 *  - uniquifyBatchNames: give distinct images that derive the same filename
 *    clean unique names within one batch (image.png, image-2.png), so Chrome's
 *    conflictAction:'uniquify' " (2)" suffix never appears within a batch.
 * Both are pure.
 */

/** Split images by whether their canonical src is already on disk. Order preserved. */
export function partitionByDownloaded(
  images: readonly ImageInfo[],
  onDiskKeys: SrcKeySet,
): { keep: ImageInfo[]; skipped: ImageInfo[] } {
  const keep: ImageInfo[] = [];
  const skipped: ImageInfo[] = [];
  for (const image of images) {
    (onDiskKeys.has(image.src) ? skipped : keep).push(image);
  }
  return { keep, skipped };
}

/** De-collide a batch of relative download paths. For each repeated path, insert
 *  `-2`, `-3`, … before the extension of the BASENAME (directory preserved).
 *  Collision detection is case-insensitive (Windows/macOS). A collision-free
 *  batch is returned unchanged; order is preserved. Pure. */
export function uniquifyBatchNames(paths: readonly string[]): string[] {
  const taken = new Set<string>();
  return paths.map((path) => {
    const slash = path.lastIndexOf('/');
    const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
    const file = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = file.lastIndexOf('.');
    // dot > 0 so a dotfile (".env") keeps its whole name as the base.
    const base = dot > 0 ? file.slice(0, dot) : file;
    const ext = dot > 0 ? file.slice(dot) : ''; // includes the leading '.'
    let candidate = path;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${dir}${base}-${n}${ext}`;
      n++;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
