import { MediaCandidate, Resolver, ResolveContext } from './types';

const FULL_SRC = /w\.wallhaven\.cc\/full\/[a-z0-9]{2}\/wallhaven-[a-z0-9]+\.(jpg|png|gif)/i;

function idFrom(u: URL, ctx: ResolveContext): string | null {
  const m = u.pathname.match(/^\/(?:small|lg|orig)\/[a-z0-9]{2}\/([a-z0-9]+)\.jpg$/i);
  if (m) return m[1];
  // The fallback id is a page-controlled attribute; it's interpolated into a URL
  // path, so require the real id shape (alphanumeric) — otherwise a value with
  // '/', '?', or '..' could bend the constructed wallhaven URL.
  const fig = ctx.el?.closest?.('figure[data-wallpaper-id]') as HTMLElement | null;
  const id = fig?.dataset.wallpaperId;
  return id && /^[a-z0-9]+$/i.test(id) ? id : null;
}

/** Reads the real full-file extension from the DOM only (never guesses jpg). */
function extFrom(ctx: ResolveContext): 'jpg' | 'png' | 'gif' | null {
  const el = ctx.el;
  if (!el) return null;

  // (1) A full <img> reachable from the element (the /w/<id> detail page).
  const full = (el.getAttribute?.('src') || '') + ' ' + (el.getAttribute?.('data-src') || '');
  const dm = full.match(FULL_SRC);
  if (dm) return dm[1].toLowerCase() as 'jpg' | 'png' | 'gif';
  const pageImg = el.ownerDocument?.querySelector('#wallpaper[src], img[src*="w.wallhaven.cc/full/"]');
  const pm = pageImg?.getAttribute('src')?.match(FULL_SRC);
  if (pm) return pm[1].toLowerCase() as 'jpg' | 'png' | 'gif';

  // (2) The PNG/GIF badge on grid figures; default jpg when a figure exists.
  const fig = el.closest?.('figure');
  if (fig) {
    if (fig.querySelector('span.png')) return 'png';
    if (fig.querySelector('span.gif')) return 'gif';
    return 'jpg';
  }
  return null; // bare thumb, no context -> Phase 2 probe
}

export const wallhavenResolver: Resolver = {
  id: 'wallhaven',
  match: (u) => u.hostname === 'th.wallhaven.cc',
  resolve: (u, ctx): MediaCandidate[] => {
    const id = idFrom(u, ctx);
    if (!id) return [];
    const ext = extFrom(ctx);
    if (!ext) {
      // No DOM extension evidence: keep the downloadable thumb, tag for opt-in resolve.
      return [{ url: u.href, kind: 'image', thumbnailSrc: u.href, resolveHint: { platform: 'wallhaven', id } }];
    }
    const ab = id.slice(0, 2);
    return [{
      url: `https://w.wallhaven.cc/full/${ab}/wallhaven-${id}.${ext}`,
      kind: 'image', ext, thumbnailSrc: u.href,
    }];
  },
};
