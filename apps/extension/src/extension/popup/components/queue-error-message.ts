/**
 * Human-readable text for a failed queue item's stored `error`. The reducer keeps
 * terse codes (e.g. `SERVER_FORBIDDEN`) for its own logic; this maps them to a
 * sentence for the queue row so a raw code never reaches the user. Anything that
 * still looks like a bare code (ALL_CAPS / underscores) falls back to a generic
 * message rather than being shown verbatim.
 */
export function queueErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'SERVER_FORBIDDEN':
      return 'Blocked by the server — try “Retry w/ referer”.';
    case 'Cancelled':
      return 'Cancelled.';
    case 'Link expired':
      return 'Link expired — open the source and collect it again.';
    case 'retry limit reached':
      return 'Failed after several tries.';
    default:
      if (!error) return 'Download failed.';
      return /^[A-Z][A-Z0-9_]+$/.test(error) ? 'Download failed.' : error;
  }
}
