import { ImageInfo } from '@mbd/core/types';
import { stripUrlSecrets } from '@mbd/core/net/url-secrets';

/**
 * The per-file metadata sidecar (#284): a `<mediafile>.json` written next to a
 * downloaded item so provenance the raw file loses (source URL, page, alt,
 * dimensions) survives. Serializes already-collected local data — fully offline,
 * no new network. URLs are run through the shared secret filter so no signing
 * token is written to disk.
 *
 * The schema is STABLE: every key is always present (null for an unknown value)
 * so downstream tooling can rely on the shape.
 */
export interface MediaSidecar {
  /** Original media URL (query secrets stripped). */
  src: string;
  /** Page the media was collected from (query secrets stripped; '' if unknown). */
  pageUrl: string;
  pageTitle: string | null;
  alt: string;
  kind: ImageInfo['kind'];
  /** Download extension/format — the resolver's `ext` if set, else the type. */
  format: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  /** Resolver family that produced `src` (the `mediaKey` prefix, e.g. 'fb'), or null. */
  resolver: string | null;
  /** ISO-8601 time the file was downloaded. */
  capturedAt: string;
}

/** The fields the sidecar needs — a structural subset of ImageInfo, so both a
 *  full item and a convert-path source object satisfy it. */
export type SidecarSource = Pick<ImageInfo, 'src' | 'alt' | 'width' | 'height' | 'type' | 'kind'> &
  Partial<Pick<ImageInfo, 'ext' | 'fileSize' | 'mediaKey'>>;

const positive = (n: number | undefined): number | null => (typeof n === 'number' && n > 0 ? n : null);

/** The resolver family = the `mediaKey` prefix before ':' (e.g. `fb:123` → 'fb'). */
const resolverOf = (mediaKey?: string): string | null =>
  mediaKey && mediaKey.includes(':') ? mediaKey.slice(0, mediaKey.indexOf(':')) : null;

/** Build the sidecar record for one item. `capturedAt` is injected (not read from
 *  the clock) so the output is deterministic and testable. */
export function buildMediaSidecar(
  item: SidecarSource,
  source: { url?: string; title?: string } | undefined,
  capturedAt: string,
): MediaSidecar {
  return {
    src: stripUrlSecrets(item.src),
    pageUrl: source?.url ? stripUrlSecrets(source.url) : '',
    pageTitle: source?.title ?? null,
    alt: item.alt ?? '',
    kind: item.kind,
    format: item.ext ?? item.type,
    width: positive(item.width),
    height: positive(item.height),
    bytes: positive(item.fileSize),
    resolver: resolverOf(item.mediaKey),
    capturedAt,
  };
}

/** Pretty-printed JSON payload for the sidecar file (trailing newline). */
export const serializeSidecar = (sidecar: MediaSidecar): string => `${JSON.stringify(sidecar, null, 2)}\n`;

/** The sidecar filename for a media file: `photo.jpg` → `photo.jpg.json`. Keeps
 *  any subfolder path so the sidecar lands beside the media (and in the same ZIP
 *  folder). */
export const sidecarName = (mediaFilename: string): string => `${mediaFilename}.json`;
