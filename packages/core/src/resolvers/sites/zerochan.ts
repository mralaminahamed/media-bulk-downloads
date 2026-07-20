import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

const HOSTS = new Set(['zerochan.net', 'www.zerochan.net']);
const IMG_HOSTS = ['zerochan.net'];

function pageHost(ctx: ResolveContext): string | null {
  try { return new URL(ctx.pageUrl ?? '').hostname.toLowerCase(); } catch { return null; }
}

/** Pin a page-supplied URL to https on one of the allowed host suffixes, else null. */
function pinnedDomUrl(url: string | null | undefined, suffixes: string[]): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url, document.baseURI);
    if (u.protocol !== 'https:') return null;
    return suffixes.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`)) ? u.href : null;
  } catch {
    return null;
  }
}

/** Pull `contentUrl` from a JSON-LD node (or a node inside its `@graph`/array),
 *  restricted to ImageObject (or an untyped node) so a BreadcrumbList/WebSite
 *  block is never mistaken for the image. */
function contentUrlFrom(data: unknown): string | null {
  const nodes: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { '@graph'?: unknown })?.['@graph'])
      ? ((data as { '@graph': unknown[] })['@graph'])
      : [data];
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const node = n as { '@type'?: unknown; contentUrl?: unknown };
    const type = node['@type'];
    const isImage = type === 'ImageObject' || type === undefined;
    if (isImage && typeof node.contentUrl === 'string') return node.contentUrl;
  }
  return null;
}

/** The full image URL from the page's JSON-LD ImageObject, or null. */
function jsonLdContentUrl(doc: Document | null | undefined): string | null {
  const scripts = doc?.querySelectorAll?.('script[type="application/ld+json"]');
  if (!scripts) return null;
  for (const s of Array.from(scripts)) {
    try {
      const url = contentUrlFrom(JSON.parse(s.textContent ?? ''));
      if (url) return url;
    } catch {
      // malformed JSON-LD block — skip it, try the next / the anchor fallback
    }
  }
  return null;
}

export const zerochanResolver: Resolver = {
  id: 'zerochan',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && HOSTS.has(host);
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const el = ctx.el;
    if (!el) return [];
    const large = el.closest?.('#large');
    if (!large) return [];
    const raw = jsonLdContentUrl(el.ownerDocument)
      ?? large.querySelector?.('a.preview')?.getAttribute?.('href')
      ?? null;
    const full = pinnedDomUrl(raw, IMG_HOSTS);
    if (!full || full === u.href) return [];
    const c: MediaCandidate = { url: full, kind: 'image', thumbnailSrc: u.href };
    const ext = extensionFromUrl(full);
    if (ext) c.ext = ext;
    return [c];
  },
};
