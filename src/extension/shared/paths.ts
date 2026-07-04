/**
 * Sanitizes a user-supplied path segment: strips path traversal, leading
 * slashes and characters illegal in download filenames. chrome.downloads
 * already rejects absolute paths and "..", but we normalize defensively.
 */
/** Windows reserved device names (also reserved with any extension, e.g. CON.jpg). */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function sanitizePathSegment(segment: string): string {
  return segment
    // Control chars are intentionally part of the illegal-filename set.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    // Windows silently strips trailing dots/spaces when resolving a path, which
    // could turn ".. " back into "..". Trim first, then drop . / .. / empties.
    .map((part) => part.replace(/[. ]+$/, ''))
    .filter((part) => part && part !== '.' && part !== '..')
    // Prefix reserved device names so they become ordinary files, not devices.
    .map((part) => (RESERVED_NAME.test(part) ? `_${part}` : part))
    .join('/');
}
