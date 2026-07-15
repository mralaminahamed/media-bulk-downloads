/**
 * Streamable video-id extraction. Streamable serves the progressive MP4 behind a
 * public JSON API (api.streamable.com/videos/<shortcode>), not a raw file the page
 * exposes, so the generic passes miss it. This shortcode feeds the opt-in network
 * resolve path (resolvers/network.ts → streamable), which reads `files.mp4.url`.
 *
 * Only public videos resolve; private/login-gated ones return no `files.mp4.url`
 * and are left unresolved (no circumvention).
 */

// Streamable shortcodes are short lowercase-alnum (typically 5-6 chars).
const CODE = '([a-z0-9]{4,12})';
// Watch: streamable.com/<code>; embeds: /e/<code>, /o/<code>, /s/<code>.
const EMBED_RE = new RegExp(`^/(?:e|o|s)/${CODE}(?:[/?#]|$)`);
// A watch URL is a SINGLE path segment — `/user/foo` (two segments) is not a video.
const WATCH_RE = new RegExp(`^/${CODE}/?(?:[?#]|$)`);
// Non-video first path segments on streamable.com — never a shortcode.
const RESERVED = new Set([
  'login', 'signup', 'signin', 'logout', 'terms', 'privacy', 'about', 'help',
  'settings', 'account', 'upload', 'premium', 'pricing', 'embed', 'blog', 'api',
  'contact', 'dmca', 'explore', 'search', 'e', 'o', 's',
]);

/**
 * Extracts a Streamable shortcode from a watch URL or an embed URL, or null when
 * the URL isn't a single Streamable video (a reserved page, or a non-Streamable
 * host). The bare `/<code>` form is refused for reserved first segments so
 * `streamable.com/login` is never mistaken for a video.
 */
export function streamableVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'streamable.com' && !host.endsWith('.streamable.com')) return null;
  const embed = u.pathname.match(EMBED_RE);
  if (embed) return embed[1];
  const watch = u.pathname.match(WATCH_RE);
  if (watch && !RESERVED.has(watch[1])) return watch[1];
  return null;
}
