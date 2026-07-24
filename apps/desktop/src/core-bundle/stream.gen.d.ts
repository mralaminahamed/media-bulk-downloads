// Hand-written types for the generated `stream.gen.js` (gitignored,
// Vite-bundled from stream-entry.ts by build-collector.ts's buildStreamBundle()).
// Associated to the generated JS via a `@ts-self-types` directive that
// buildStreamBundle() prepends to the emitted file — see build-collector.ts.

export interface HlsByteRange {
  length: number;
  offset: number;
}

export type DecryptFn = (key: Uint8Array, iv: Uint8Array, data: Uint8Array) => Promise<Uint8Array>;

export interface HlsDeps {
  fetchText: (url: string) => Promise<string>;
  /** `range` (when set) must be honoured with a Range request. */
  fetchBytes: (url: string, range?: HlsByteRange) => Promise<Uint8Array>;
  decrypt: DecryptFn;
  /** Bounded parallel segment fetches (default 6). */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface HlsVariant {
  uri: string;
  bandwidth: number;
  resolution?: { width: number; height: number };
  codecs?: string;
  name?: string;
  audioGroup?: string;
}

export interface HlsCaptureOptions {
  /** 'highest' (default) or 'lowest' bandwidth, or a target height (e.g. 720). */
  quality?: 'highest' | 'lowest' | number;
  /** Refuse once the running assembled size would exceed this (bytes). */
  maxBytes?: number;
  /** Extract just the audio track as `.m4a`. Only the demuxed case (a separate
   *  audio rendition) is supported. */
  audioOnly?: boolean;
}

export interface HlsCaptureResult {
  bytes: Uint8Array;
  ext: 'ts' | 'mp4' | 'aac' | 'm4a';
  mime: string;
  variant?: HlsVariant;
  muxedAudio?: boolean;
  segmentCount: number;
  durationSec: number;
}

export function captureHls(manifestUrl: string, deps: HlsDeps, opts?: HlsCaptureOptions): Promise<HlsCaptureResult>;
export function browserHlsDeps(onProgress?: (done: number, total: number) => void): HlsDeps;
export const webcryptoDecrypt: DecryptFn;
