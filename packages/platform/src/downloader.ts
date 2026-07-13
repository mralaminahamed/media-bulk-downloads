/**
 * Downloader — the browser-capability seam over the file-download API.
 *
 * Chrome/Edge/Firefox implement this with `chrome.downloads`; Safari (which
 * ships no downloads API) implements it with a page-context `<a download>`
 * blob click. The extension talks only to this interface so the divergent
 * backends stay isolated in the app layer.
 */

/** A single download to start. */
export interface DownloadRequest {
  /** Source URL (http(s) or a blob:/data: URL). */
  url: string;
  /** Suggested target filename, may include a subdirectory on backends that support it. */
  filename: string;
  /** Prompt the user for a save location instead of using the default directory. */
  saveAs?: boolean;
  /** How to resolve an existing file of the same name. */
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
}

/** State of a download as reported by the backend. */
export interface DownloadRecord {
  id: number;
  filename: string;
  state: 'in_progress' | 'complete' | 'interrupted';
  bytesReceived?: number;
  totalBytes?: number;
  error?: string;
}

/** Query for {@link Downloader.search}. */
export interface DownloadQuery {
  id?: number;
  /** 0 means "all". */
  limit?: number;
}

/** Notified when a download's state changes. */
export type DownloadChangeListener = (change: {
  id: number;
  state?: DownloadRecord['state'];
  error?: string;
}) => void;

export interface Downloader {
  /** Whether this backend can actually download (false on capability-degraded targets). */
  readonly available: boolean;
  /** Start a download; resolves to the backend's download id, or undefined on failure. */
  download(request: DownloadRequest): Promise<number | undefined>;
  /** Look up prior/in-flight downloads (used for on-disk dedupe + progress). */
  search(query: DownloadQuery): Promise<DownloadRecord[]>;
  /** Reveal the finished file / open it, when supported. */
  open(id: number): void;
  show(id: number): void;
  /** Subscribe to state changes (progress, completion, failure). */
  onChanged(listener: DownloadChangeListener): void;
}
