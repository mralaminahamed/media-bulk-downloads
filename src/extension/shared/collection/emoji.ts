/**
 * Detects emoji graphics served by the common emoji CDNs (Twitter, WordPress
 * core, GitHub, jsdelivr, the legacy maxcdn host, and Facebook/Instagram's
 * emoji.php renderer), so the collection filter can hide them when the user
 * enables "Exclude emoji". Matches on host + path — not a bare substring — to
 * keep false positives near zero. Collected srcs are always absolute http(s)
 * URLs, so an unparseable src is treated as not-emoji.
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
    ((host === 'githubassets.com' || host.endsWith('.githubassets.com')) &&
      path.includes('/images/icons/emoji/')) ||
    // Facebook / Instagram (and Messenger) render emoji via `/…/emoji.php/…`. The
    // path is the discriminator — real fbcdn photos live on scontent hosts under
    // `/v/…` and never carry `/emoji.php`. Dot-boundary host match rejects
    // look-alikes (evilfbcdn.net).
    ((host === 'fbcdn.net' || host.endsWith('.fbcdn.net') ||
      host === 'facebook.com' || host.endsWith('.facebook.com')) &&
      path.includes('/emoji.php'))
  );
}
