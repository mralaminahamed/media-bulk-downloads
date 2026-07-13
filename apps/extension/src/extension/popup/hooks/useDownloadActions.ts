import { Dispatch, SetStateAction } from 'react';
import { AppState, DownloadBytesMessage, DownloadMessage, DownloadResponse, DownloadZipMessage, ImageInfo, SettingsData } from '@mbd/core/types';
import { buildZip, zipFileName } from '@mbd/core/download/zip';
import { convertImage, isConvertible } from '@mbd/core/download/convert/convert';
import { u8ToBase64 } from '@mbd/core/download/base64';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { hostFromUrl, registrableDomain, todayISO } from '@mbd/core/collection/paths';
import { requestCaptureStream } from '@/extension/shared/active-tab/capture-stream-active';
import { copyText, downloadText, mapWithConcurrency } from '@/extension/popup/utils';
import { downloadable } from '@/extension/popup/lib/appHelpers';

/** A refused/undownloadable stream (#285): the item, the engine refusal code,
 *  the page it was found on (→ the Referer for the copied command), and whether
 *  the user asked for audio-only (→ the copied command extracts audio too, rather
 *  than silently handing back a full-video download). */
export interface StreamRefusal {
  item: ImageInfo;
  code: string;
  referer: string;
  audioOnly: boolean;
}

export interface UseDownloadActionsParams {
  settings: SettingsData;
  /** The currently shown (filtered) image set — owned by the scan/resolution engine (useMediaEngine). */
  filteredImages: ImageInfo[];
  selectedSrcs: Set<string>;
  setState: Dispatch<SetStateAction<AppState>>;
  setProgress: Dispatch<SetStateAction<{ label: string; done: number; total: number } | null>>;
  /**
   * Owned by App (it depends on `surface`), so it's threaded in rather than
   * duplicated here — the same instance App already passes to useFavourites.
   */
  currentSourcePage: () => Promise<{ url: string; title?: string }>;
  /**
   * Reports a stream capture that was *refused* (DRM / live / SAMPLE-AES /
   * unsupported), so App can offer the "Copy download command" handoff (#285).
   * Called with the refusal on refusal, and with null at the start of each
   * capture attempt to clear a stale banner.
   */
  onStreamRefused?: (refusal: StreamRefusal | null) => void;
}

export interface UseDownloadActionsResult {
  handleDownload: (images: ImageInfo | ImageInfo[]) => Promise<void>;
  handleBulkDownload: () => void;
  handleSingleImageDownload: (image: ImageInfo) => void;
  /** Capture a stream item but keep only its audio track, saved as `.m4a` (#204). */
  handleCaptureAudio: (image: ImageInfo) => void;
  handleDownloadZip: (images: ImageInfo[]) => Promise<void>;
  handleBulkDownloadZip: () => void;
  handleDownloadSelected: () => void;
  handleDownloadSelectedZip: () => void;
  handleCopyLinks: (images: ImageInfo[]) => Promise<void>;
  handleExportLinks: (images: ImageInfo[]) => Promise<void>;
}

/**
 * The download/export action layer: sends files to the background for
 * download (plain, convert-on-download, or ZIP), captures HLS streams, and
 * copies/exports link lists. Pure orchestration over the current
 * settings/selection/filtered-view — owns no state of its own beyond what it
 * needs to call back into `setState`/`setProgress` (both owned by
 * `useMediaEngine`).
 */
export function useDownloadActions({
  settings,
  filteredImages,
  selectedSrcs,
  setState,
  setProgress,
  currentSourcePage,
  onStreamRefused,
}: UseDownloadActionsParams): UseDownloadActionsResult {
  const handleDownload = async (images: ImageInfo | ImageInfo[]): Promise<void> => {
    const list = Array.isArray(images) ? images : [images];
    // HLS streams are captured (fetch + assemble segments), not fetched as a
    // single file — route them to the capture path, sequentially.
    const streams = list.filter((i) => i.hlsManifest);
    for (const s of streams) await captureStream(s);
    const rest = list.filter((i) => !i.hlsManifest);
    if (!rest.length) return;
    const target = settings.convertImagesTo;
    if (target === 'off') {
      await sendPlainDownload(rest);
      return;
    }
    await convertAndDownload(rest, target);
  };

  /**
   * Capture an HLS stream. The heavy lifting (fetch + mux + blob) runs in the
   * background's offscreen document; this only fires the request, mirrors progress
   * into the ProgressBar, and shows the status the background composes. The
   * capture completes even if the popup closes before this resolves.
   */
  const captureStream = async (item: ImageInfo, audioOnly = false): Promise<void> => {
    const sourcePage = await currentSourcePage();
    // Clear any prior handoff banner before this attempt (#285).
    onStreamRefused?.(null);
    const label = audioOnly ? 'Extracting audio' : 'Capturing stream';
    setProgress({ label, done: 0, total: 0 });
    try {
      const { status, refusal } = await requestCaptureStream(
        item,
        sourcePage,
        (done, total) => setProgress({ label, done, total }),
        audioOnly,
      );
      setState((prev) => ({ ...prev, status }));
      // A refused stream (DRM/live/SAMPLE-AES/unsupported, or audio-unavailable when
      // extracting audio) becomes a handoff: the page URL is the Referer for the
      // yt-dlp/ffmpeg command the user copies (#285).
      if (refusal) onStreamRefused?.({ item, code: refusal.code, referer: sourcePage.url, audioOnly });
    } finally {
      setProgress(null);
    }
  };

  /** The original, fast path: hand the source URLs to the background to download. */
  const sendPlainDownload = async (list: ImageInfo[]): Promise<void> => {
    setState((prev) => ({
      ...prev,
      status: `Sending ${list.length} file${list.length === 1 ? '' : 's'} to downloads…`,
    }));
    const sourcePage = await currentSourcePage();
    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: list, sourcePage };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      // chrome.runtime.lastError is only valid during this callback — capture it now.
      const error = chrome.runtime.lastError;
      const status = error ? `Error: ${error.message || 'unknown error'}` : response.message;
      setState((prev) => ({ ...prev, status }));
    });
  };

  /**
   * Convert-on-download: raster images are fetched, re-encoded to the target
   * format via canvas, and saved as bytes. Non-convertible items (video/audio,
   * svg, gif, already-target) and any that fail download in their original form.
   */
  const convertAndDownload = async (list: ImageInfo[], target: 'png' | 'jpeg'): Promise<void> => {
    const toConvert = list.filter((i) => isConvertible(i, target));
    const passthrough = list.filter((i) => !isConvertible(i, target));
    const sourcePage = await currentSourcePage();

    if (passthrough.length) {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', images: passthrough, sourcePage } as DownloadMessage);
    }
    if (!toConvert.length) {
      setState((prev) => ({ ...prev, status: `Sent ${passthrough.length} file${passthrough.length === 1 ? '' : 's'} to downloads…` }));
      return;
    }

    setProgress({ label: 'Converting', done: 0, total: toConvert.length });
    let done = 0;
    const failed: ImageInfo[] = [];
    await mapWithConcurrency(toConvert, 3, async (img, index) => {
      try {
        const res = await fetch(img.src);
        if (!res.ok) throw new Error('fetch');
        // preserve metadata unless the user explicitly chose to strip it. If the
        // source's metadata can't be carried across, convertImage returns null and
        // the item falls through to a plain download of the original (below).
        const converted = await convertImage(await res.blob(), target, {
          preserveMetadata: settings.convertMetadata !== 'strip',
        });
        if (!converted) throw new Error('convert');
        const filename = buildDownloadFilename({ ...img, ext: converted.ext }, index, settings, sourcePage.url);
        const msg: DownloadBytesMessage = {
          type: 'DOWNLOAD_BYTES', filename, b64: u8ToBase64(converted.bytes), mime: converted.mime,
          // Carry the original identity so the background records it to history
          // (the "already downloaded" mark + dedup), like a plain download — plus
          // the alt/dimensions and output ext the metadata sidecar needs (#284).
          source: {
            src: img.src, kind: img.kind, type: img.type,
            ...(img.thumbnailSrc ?? img.poster ? { thumbnailSrc: img.thumbnailSrc ?? img.poster } : {}),
            sourcePageUrl: sourcePage.url,
            ...(sourcePage.title ? { sourcePageTitle: sourcePage.title } : {}),
            alt: img.alt, width: img.width, height: img.height, fileSize: img.fileSize, ext: converted.ext,
          },
        };
        chrome.runtime.sendMessage(msg);
      } catch {
        failed.push(img);
      } finally {
        setProgress({ label: 'Converting', done: ++done, total: toConvert.length });
      }
    });
    setProgress(null);

    // Anything that couldn't be fetched/decoded downloads in its original format.
    if (failed.length) {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', images: failed, sourcePage } as DownloadMessage);
    }
    const okCount = toConvert.length - failed.length;
    const note = failed.length ? ` ${failed.length} couldn't convert — saved original.` : '';
    setState((prev) => ({ ...prev, status: `Converted ${okCount} image${okCount === 1 ? '' : 's'} to ${target.toUpperCase()}.${note}` }));
  };

  const handleBulkDownload = (): void => {
    // Always act on the shown (filtered) set — never fall back to the unfiltered
    // images, which would ignore the active filter.
    void handleDownload(downloadable(filteredImages));
  };

  const handleSingleImageDownload = (image: ImageInfo): void => void handleDownload(image);

  const handleCaptureAudio = (image: ImageInfo): void => void captureStream(image, true);

  // ── Selective bulk download ────────────────────────────────────────────────
  const handleDownloadSelected = (): void => {
    const chosen = downloadable(filteredImages).filter((i) => selectedSrcs.has(i.src));
    if (chosen.length) void handleDownload(chosen);
  };

  // ── ZIP download ───────────────────────────────────────────────────────────
  // Fetch + zip the media in this (extension) context — fetch here bypasses page
  // CORS — then hand the bytes to the background to write via chrome.downloads.
  const handleDownloadZip = async (images: ImageInfo[]): Promise<void> => {
    if (!images.length) return;
    setProgress({ label: 'Zipping', done: 0, total: images.length });

    const sourcePage = await currentSourcePage();
    const { bytes, ok, failed } = await buildZip(images, settings, sourcePage.url, {
      fetch: (...args) => fetch(...args),
      onProgress: (done, total) => setProgress({ label: 'Zipping', done, total }),
    });
    setProgress(null); // fetch phase done; the download itself is near-instant

    // Nothing could be fetched (every host blocked the hotlink / offline) — fall
    // back to individual downloads via the browser's own fetch. Use the plain
    // path, not handleDownload: the ZIP action archives originals, so its
    // fallback must not convert either (convert-on-download applies only to the
    // separate-files action). `images` is already the downloadable set (no HLS).
    if (ok === 0) {
      void sendPlainDownload(images);
      return;
    }

    // Items that failed to fetch fall back to a normal per-file download
    // (fire-and-forget; the ZIP response owns the status line).
    if (failed.length) {
      const fallback: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: failed, sourcePage };
      chrome.runtime.sendMessage(fallback);
    }

    const filename = zipFileName(sourcePage.url);
    const message: DownloadZipMessage = { type: 'DOWNLOAD_ZIP', b64: u8ToBase64(bytes), filename };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      const error = chrome.runtime.lastError;
      const base = error ? `Error: ${error.message || 'unknown error'}` : response.message;
      const note = failed.length ? ` ${failed.length} couldn't be fetched — downloading those individually.` : '';
      setState((prev) => ({ ...prev, status: `${base}${note}` }));
    });
  };

  const handleBulkDownloadZip = (): void => void handleDownloadZip(downloadable(filteredImages));

  const handleDownloadSelectedZip = (): void => {
    const chosen = downloadable(filteredImages).filter((i) => selectedSrcs.has(i.src));
    if (chosen.length) void handleDownloadZip(chosen);
  };

  // ── Copy / export links ──────────────────────────────────────────────────
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  const linkList = (images: ImageInfo[]): string => images.map((i) => i.src).join('\n');
  const linksFileName = (url?: string): string => {
    const domain = registrableDomain(hostFromUrl(url));
    return `${domain ? `${domain}-` : ''}media-links-${todayISO()}.txt`;
  };

  const handleCopyLinks = async (images: ImageInfo[]): Promise<void> => {
    if (!images.length) return;
    const ok = await copyText(linkList(images));
    setState((prev) => ({ ...prev, status: ok ? `Copied ${plural(images.length, 'link')}.` : 'Copy failed — clipboard blocked.' }));
  };

  const handleExportLinks = async (images: ImageInfo[]): Promise<void> => {
    if (!images.length) return;
    const { url } = await currentSourcePage();
    downloadText(linksFileName(url), linkList(images), 'text/plain');
    setState((prev) => ({ ...prev, status: `Exported ${plural(images.length, 'link')}.` }));
  };

  return {
    handleDownload,
    handleBulkDownload,
    handleSingleImageDownload,
    handleCaptureAudio,
    handleDownloadZip,
    handleBulkDownloadZip,
    handleDownloadSelected,
    handleDownloadSelectedZip,
    handleCopyLinks,
    handleExportLinks,
  };
}
