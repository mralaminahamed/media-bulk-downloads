import { textToBase64 } from '@mbd/core/download/base64';
import { sidecarName } from '@mbd/core/download/metadata-sidecar';

/**
 * Writes a `<mediafile>.json` provenance sidecar (#284) named to match the media
 * file's ACTUAL on-disk filename, so the two never diverge (I6). The media file is
 * downloaded with `conflictAction:'uniquify'`, so a name that already exists is
 * saved as `image_1 (1).jpg` — but the sidecar was being fired independently with
 * the pre-uniquify name, landing beside the WRONG (or no) media file.
 *
 * Fix: don't guess. Schedule the sidecar against the media download's id and write
 * it only once that download COMPLETES, deriving the name from the file's real
 * path. Chrome's uniquify only ever changes the basename, never the directory, so
 * the final relative path is `dir(requested) + basename(actual)`.
 *
 * In-memory and best-effort, matching the sidecar's existing semantics: if the
 * service worker is torn down before the media download settles, the sidecar is
 * skipped (an optional provenance file). One shared onChanged listener drains the
 * map and ignores ids it didn't schedule, so it coexists with the queue dispatcher.
 */

interface PendingSidecar {
  json: string;
  /** The media's requested relative directory (with trailing slash, or ''). */
  dir: string;
}

const pending = new Map<number, PendingSidecar>();
let installed = false;

/** Basename of a download path (relative or absolute, either slash style). */
const baseOf = (p: string): string => p.split(/[\\/]/).pop() ?? p;
/** Directory of a relative download path, with a trailing slash, or '' if none. */
const dirOf = (p: string): string => {
  const i = p.replace(/\\/g, '/').lastIndexOf('/');
  return i >= 0 ? p.replace(/\\/g, '/').slice(0, i + 1) : '';
};

function writeSidecar(p: PendingSidecar, mediaFinalPath: string): void {
  const relative = `${p.dir}${baseOf(mediaFinalPath)}`;
  chrome.downloads.download(
    {
      url: `data:application/json;base64,${textToBase64(p.json)}`,
      filename: sidecarName(relative),
      saveAs: false,
      conflictAction: 'uniquify',
    },
    () => void chrome.runtime.lastError,
  );
}

function onChanged(delta: chrome.downloads.DownloadDelta): void {
  const p = pending.get(delta.id);
  if (!p) return;
  const state = delta.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  pending.delete(delta.id);
  if (state !== 'complete') return;
  void chrome.downloads.search({ id: delta.id }).then((items) => {
    const finalPath = items?.[0]?.filename;
    if (finalPath) writeSidecar(p, finalPath);
  });
}

/**
 * Schedule a provenance sidecar to be written once the media download `mediaDownloadId`
 * completes, named to match its final (possibly uniquified) filename. `requestedPath`
 * is the relative filename the media was requested with — its directory is reused.
 */
export function scheduleSidecar(mediaDownloadId: number, requestedPath: string, json: string): void {
  pending.set(mediaDownloadId, { json, dir: dirOf(requestedPath) });
  if (!installed) {
    installed = true;
    chrome.downloads.onChanged.addListener(onChanged);
  }
}

/** Test hook: clear scheduled sidecars and re-arm the listener guard. */
export function __resetSidecarWriter(): void {
  pending.clear();
  installed = false;
}
