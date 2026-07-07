/**
 * Detects emoji graphics served by the common twemoji CDNs (Twitter, WordPress
 * core, GitHub, jsdelivr, the legacy maxcdn host), so the collection filter can
 * hide them when the user enables "Exclude emoji". Matches on host + path — not
 * a bare substring — to keep false positives near zero. Collected srcs are always
 * absolute http(s) URLs, so an unparseable src is treated as not-emoji.
 */
export function isEmojiUrl(src: string): boolean {
  let host: string;
  let path: string;
  try {
    const u = new URL(src);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return false;
  }
  return (
    (host === 'abs.twimg.com' && path.startsWith('/emoji/')) ||
    (host === 's.w.org' && path.startsWith('/images/core/emoji/')) ||
    host === 'twemoji.maxcdn.com' ||
    (host === 'cdn.jsdelivr.net' && path.includes('/twemoji')) ||
    (host.endsWith('githubassets.com') && path.includes('/images/icons/emoji/'))
  );
}
