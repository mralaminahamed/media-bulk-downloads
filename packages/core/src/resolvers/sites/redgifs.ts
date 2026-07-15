/**
 * RedGifs video-id extraction. RedGifs serves the real MP4 behind a token-auth'd
 * public API (api.redgifs.com/v2/gifs/<id>), not a file the page exposes, so the
 * generic passes miss it. This id feeds the opt-in network resolve path
 * (resolvers/network.ts → redgifs), which reads `gif.urls.hd`.
 *
 * The resolved media lives on the hotlink-protected media.redgifs.com; the
 * download itself relies on the #197 Referer rewrite (+ the browser's real
 * User-Agent) to clear the CDN's 403, so it works cleanest when collected on
 * redgifs.com (whose page URL becomes the injected Referer).
 */

// RedGifs ids are lowercase-alnum words (e.g. "brightshinyexample"). The API is
// canonical-lowercase, so ids are lowercased before use.
const ID = '([A-Za-z0-9]{3,})';
// Watch page: redgifs.com/watch/<id>; embed iframe: redgifs.com/ifr/<id>.
const RE = new RegExp(`^/(?:watch|ifr)/${ID}(?:[/?#]|$)`);

/**
 * Extracts a RedGifs id from a watch URL or an embed URL, or null when the URL
 * isn't a single RedGifs video (a listing/user page, or a non-RedGifs host).
 */
export function redgifsVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'redgifs.com' && !host.endsWith('.redgifs.com')) return null;
  const m = u.pathname.match(RE);
  return m ? m[1].toLowerCase() : null;
}
