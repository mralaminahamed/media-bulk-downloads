/**
 * Sanitizes a user-supplied path segment: strips path traversal, leading
 * slashes and characters illegal in download filenames. chrome.downloads
 * already rejects absolute paths and "..", but we normalize defensively.
 */
export function sanitizePathSegment(segment: string): string {
  return segment
    // Control chars are intentionally part of the illegal-filename set.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}
