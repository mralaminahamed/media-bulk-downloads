import { Dispatch, RefObject, SetStateAction, useCallback, useRef, useState } from 'react';
import { AppState, FilterOptions, ImageInfo, SettingsData } from '@mbd/core/types';
import { filterImagesBySettings, applyToolbarFilters, filterExcluded, isPendingOrStream, ExcludedMatchers } from '@mbd/core/collection/filters';
import { markNearDuplicates, DedupInput, DEFAULT_NEAR_DUP_THRESHOLD } from '@mbd/core/collection/phash';
import { fetchImageBytes, mapWithConcurrency } from '@/extension/popup/utils';
import type { HashRequest, HashResponse } from '@/extension/popup/workers/phash.worker';

/** How many image bytes to fetch at once. Matches the size-enrichment cap so a
 *  dedup pass doesn't fire hundreds of simultaneous requests. */
const DEDUP_FETCH_CONCURRENCY = 6;

export interface NearDuplicateProgress {
  done: number;
  total: number;
}

export interface UseNearDuplicatesParams {
  rawImagesRef: RefObject<ImageInfo[]>;
  settingsRef: RefObject<SettingsData>;
  excludedRef: RefObject<ExcludedMatchers>;
  filtersRef: RefObject<FilterOptions>;
  isDownloaded: (item: ImageInfo) => boolean;
  setState: Dispatch<SetStateAction<AppState>>;
}

export interface UseNearDuplicatesResult {
  running: boolean;
  progress: NearDuplicateProgress | null;
  /** Runs one on-demand near-duplicate pass over the eligible image set. No-op
   *  while a pass is already running or when fewer than two candidates exist. */
  run: () => Promise<void>;
  /** Aborts an in-flight pass; its partial results are discarded (nothing marked). */
  cancel: () => void;
}

/** A real, fetchable image file worth hashing — not base64, not a pending/stream
 *  placeholder, and an http(s) URL the popup can fetch (blob:/data: are out). */
function isHashCandidate(img: ImageInfo): boolean {
  return img.kind === 'image' && !img.isBase64 && !isPendingOrStream(img) && /^https?:/i.test(img.src);
}

/**
 * On-demand perceptual-hash near-duplicate pass (#198). Fetches each eligible
 * image's bytes (extension-origin, bypassing CORS) with bounded concurrency,
 * hashes them in a Web Worker off the main thread, clusters by Hamming distance,
 * and marks every non-keeper `nearDuplicate` so the default `duplicateState` filter
 * hides it from the grid, ZIP, download, and select-all at once. Non-destructive:
 * marks live on the items and are reversed by a stricter re-run or shown via the
 * filter. Modelled on `enrichImageSizes` — a generation guard discards a pass that
 * a rescan/re-run superseded.
 */
export function useNearDuplicates({
  rawImagesRef,
  settingsRef,
  excludedRef,
  filtersRef,
  isDownloaded,
  setState,
}: UseNearDuplicatesParams): UseNearDuplicatesResult {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<NearDuplicateProgress | null>(null);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (running) return;
    const generation = ++genRef.current;
    // Identity of the raw set at start. A rescan/deep-scan/enrich reassigns
    // rawImagesRef.current to a fresh array; if that happens mid-pass, the hashes
    // (keyed by src) may no longer describe the current set, so we discard.
    const rawAtStart = rawImagesRef.current;

    // Eligible image candidates, re-derived from the raw set exactly as the engine
    // does — so items hidden by min-size / exclusions aren't fetched needlessly.
    const eligible = filterExcluded(filterImagesBySettings(rawImagesRef.current, settingsRef.current), excludedRef.current);
    const targets = eligible.filter(isHashCandidate);
    if (targets.length < 2) return; // nothing could collapse

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress({ done: 0, total: targets.length });

    const worker = new Worker(new URL('../workers/phash.worker.ts', import.meta.url), { type: 'module' });
    const hashes = new Map<string, string>(); // src -> pHash
    let processed = 0;
    const bump = (): void => {
      processed++;
      setProgress({ done: processed, total: targets.length });
    };

    try {
      await new Promise<void>((resolve) => {
        let inFlight = 0; // bytes posted to the worker, awaiting a reply
        let fetchDone = false;
        const finishIfIdle = (): void => {
          if (fetchDone && inFlight === 0) resolve();
        };

        worker.onmessage = (e: MessageEvent<HashResponse>): void => {
          const m = e.data;
          if (m.type === 'HASHED') hashes.set(m.id, m.pHash);
          inFlight--;
          bump();
          finishIfIdle();
        };
        // A worker that fails to load/run (e.g. an OffscreenCanvas gap) bails the
        // whole pass; the set is left untouched (fail-safe, no partial marking).
        worker.onerror = (): void => resolve();

        void mapWithConcurrency(targets, DEDUP_FETCH_CONCURRENCY, async (img): Promise<void> => {
          try {
            if (controller.signal.aborted || generation !== genRef.current) return bump();
            // Reuse a hash from an earlier pass — skip the fetch entirely.
            if (img.pHash) {
              hashes.set(img.src, img.pHash);
              return bump();
            }
            const bytes = await fetchImageBytes(img.src, controller.signal);
            if (!bytes || controller.signal.aborted || generation !== genRef.current) return bump();
            // Increment only AFTER a successful post: if postMessage throws (e.g. a
            // DataCloneError), the catch below bumps this item without leaving a
            // phantom in-flight count that would hang the barrier forever.
            worker.postMessage({ type: 'HASH', id: img.src, bytes } satisfies HashRequest, [bytes]);
            inFlight++;
          } catch {
            bump(); // never let one item's failure stall the barrier
          }
        }).then(() => {
          fetchDone = true;
          finishIfIdle();
        });
      });
    } finally {
      worker.terminate();
      abortRef.current = null;
      setRunning(false);
      setProgress(null);
    }

    // Superseded by a newer pass, cancelled, or the raw set was replaced by a
    // rescan while we hashed — discard; mark nothing.
    if (generation !== genRef.current || controller.signal.aborted || rawImagesRef.current !== rawAtStart) return;

    const inputs: DedupInput[] = targets.flatMap((img) => {
      const pHash = hashes.get(img.src);
      return pHash ? [{ mediaKey: img.src, pHash, width: img.width, height: img.height, fileSize: img.fileSize }] : [];
    });
    const threshold = settingsRef.current.nearDuplicateThreshold ?? DEFAULT_NEAR_DUP_THRESHOLD;
    const marks = markNearDuplicates(inputs, threshold);

    // Write the fresh hashes + marks onto every item by src. An item no longer in a
    // cluster is un-hidden (so a stricter re-run reverses a prior hide) while its
    // cached pHash is kept, so a subsequent pass needn't refetch it.
    const applyMark = (img: ImageInfo): ImageInfo => {
      const pHash = hashes.get(img.src) ?? img.pHash;
      const mark = marks.get(img.src);
      if (!mark && !img.nearDuplicate && !img.duplicateGroupId && pHash === img.pHash) return img;
      return { ...img, pHash, nearDuplicate: mark ? mark.nearDuplicate : false, duplicateGroupId: mark?.duplicateGroupId };
    };

    rawImagesRef.current = rawImagesRef.current.map(applyMark);
    setState((prev) => {
      const eligibleNow = filterExcluded(filterImagesBySettings(rawImagesRef.current, settingsRef.current), excludedRef.current);
      return { ...prev, images: eligibleNow, filteredImages: applyToolbarFilters(eligibleNow, filtersRef.current, isDownloaded) };
    });
  }, [running, rawImagesRef, settingsRef, excludedRef, filtersRef, isDownloaded, setState]);

  return { running, progress, run, cancel };
}
