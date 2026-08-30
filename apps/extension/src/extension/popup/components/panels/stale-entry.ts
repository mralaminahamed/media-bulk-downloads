import { isLeaseExpired } from '@mbd/core/net/url-lease';

/** The shape History and Favourites entries share for staleness purposes. */
export interface StoredMediaEntry {
  src: string;
  expiresAt?: number;
  srcRedacted?: boolean;
}

/**
 * Why a stored entry's `src` can no longer be fetched, or null when it still
 * can. History and Favourites hold a URL indefinitely, so they are where a
 * signed CDN lease lapses first — rendering such an entry as a plain `<img>`
 * produces a broken box, and offering a re-download produces a guaranteed 403.
 * The entry itself stays listed either way: its metadata and source-page link
 * are still useful.
 */
export function staleReason(entry: StoredMediaEntry): string | null {
  if (entry.srcRedacted) {
    return 'This link came from a backup with its signing tokens removed — open the source page to collect it again.';
  }
  if (isLeaseExpired(entry.expiresAt, Date.now())) {
    return 'This link’s signature expired — open the source page to collect it again.';
  }
  return null;
}
