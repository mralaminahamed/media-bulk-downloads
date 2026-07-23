// Hand-written types for the generated `download-name.gen.js` (gitignored,
// Vite-bundled from core-entry.ts by build-collector.ts's buildCoreBundle()).
// Associated to the generated JS via a `@ts-self-types` directive that
// buildCoreBundle() prepends to the emitted file — see build-collector.ts.
import type { ImageInfo, SettingsData, HistoryEntry, FavouriteEntry } from '@mbd/core/types';

export function buildDownloadFilename(image: ImageInfo, index: number, settings: SettingsData, sourcePageUrl?: string): string;
export function mergeHistory(existing: HistoryEntry[], added: HistoryEntry[]): HistoryEntry[];
export function mergeFavourites(existing: FavouriteEntry[], added: FavouriteEntry[]): FavouriteEntry[];
export function partitionByDownloaded(images: readonly ImageInfo[], onDiskKeys: SrcKeySet): { keep: ImageInfo[]; skipped: ImageInfo[] };
export function canonicalSrcKey(src: string): string;
export class SrcKeySet {
  constructor(keys?: Set<string>);
  static from(srcs: Iterable<string>): SrcKeySet;
  has(src: string): boolean;
  withAdded(src: string): SrcKeySet;
  withoutSrc(src: string): SrcKeySet;
  readonly size: number;
}
export const HISTORY_CAP: number;
export const HISTORY_MAX_BYTES: number;
export const FAVOURITES_CAP: number;
export const FAVOURITES_MAX_BYTES: number;
