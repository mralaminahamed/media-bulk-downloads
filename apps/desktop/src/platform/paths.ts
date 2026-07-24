import { join, normalize, SEPARATOR } from 'jsr:@std/path';

/** Resolves `rel` under `root`, refusing any path that would land outside it. */
export function containedPath(root: string, rel: string): string {
  const rootNorm = normalize(root);
  const abs = normalize(join(rootNorm, rel));
  if (abs !== rootNorm && !abs.startsWith(rootNorm + SEPARATOR)) {
    throw new Error(`refusing path outside root: ${abs}`);
  }
  return abs;
}
