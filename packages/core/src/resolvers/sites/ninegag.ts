/**
 * 9GAG post-id extraction. A video/GIF post's file is id-derived and unsigned —
 * `img-9gag-fun.9cache.com/photo/<id>_460sv.mp4` (universal H.264) — so it is built
 * deterministically on the resolve pass (resolvers/network.ts → ninegag), with no
 * fetch, like the reddit case.
 *
 * This only reads the id out of a `/gag/<id>` URL. The image-vs-video decision is
 * NOT made here: collect.ts emits the resolve hint only when the post actually
 * contains a `<video>`, so an image post (no `<video>`, file `<id>_700.jpg`) never
 * produces a would-404 `_460sv.mp4`.
 */

const GAG_RE = /^\/gag\/([A-Za-z0-9]{5,12})(?:[/?#]|$)/;

/**
 * Extracts a 9GAG post id from a `/gag/<id>` URL on a 9gag.com host, or null when
 * the URL isn't a 9GAG post (a section/listing page, or a non-9GAG host).
 */
export function nineGagId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== '9gag.com' && !host.endsWith('.9gag.com')) return null;
  return u.pathname.match(GAG_RE)?.[1] ?? null;
}
