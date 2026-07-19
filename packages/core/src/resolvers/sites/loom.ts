/**
 * Loom share/embed URL recognition. A Loom recording is identified by a 32-char
 * hex session id in a `loom.com/share/<id>` or `loom.com/embed/<id>` URL. The real
 * media is minted server-side (a CloudFront-signed cdn.loom.com mp4 via an
 * unauthenticated POST), so — like Vimeo/Dailymotion — content/collect.ts emits a
 * pending video carrying this id and resolvers/network.ts → loom fetches the file
 * on the opt-in resolve pass.
 */

function isLoomHost(host: string): boolean {
  return host === 'loom.com' || host === 'www.loom.com';
}

/**
 * Returns the 32-hex Loom session id for a share or embed URL, or null. The id
 * shape is validated here so a bad path can never reach the resolver's request.
 */
export function loomVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isLoomHost(u.hostname.toLowerCase())) return null;
  const m = /^\/(?:share|embed)\/([0-9a-f]{32})(?:[/?#]|$)/i.exec(u.pathname);
  return m ? m[1].toLowerCase() : null;
}
