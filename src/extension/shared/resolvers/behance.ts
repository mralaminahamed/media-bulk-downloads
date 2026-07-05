import { imageExtFromUrl } from '@/extension/shared/mediaType';
import { MediaCandidate, Resolver, ResolveContext } from './types';

const HOST = 'mir-s3-cdn-cf.behance.net';
const SOURCE_RE = new RegExp(`${HOST.replace(/\./g, '\\.')}/project_modules/(?:source|fs)/`);

/** A Behance CDN URL already at max size (source/fs) present in the element's
 *  own src/srcset (or a sibling <source>). Null when none. */
function domSourceFrom(el: Element | undefined): string | null {
  if (!el) return null;
  const urls: string[] = [];
  const grab = (v: string | null | undefined) => {
    if (v) urls.push(...v.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean));
  };
  grab(el.getAttribute?.('src'));
  grab(el.getAttribute?.('srcset'));
  grab(el.getAttribute?.('data-src'));
  el.closest?.('picture')?.querySelectorAll('source').forEach((s) => grab(s.getAttribute('srcset')));
  return urls.find((u) => SOURCE_RE.test(u)) ?? null;
}

export const behanceResolver: Resolver = {
  id: 'behance',
  match: (u) => u.hostname === HOST,
  resolve: (u, ctx: ResolveContext): MediaCandidate[] => {
    const out = new URL(u.href);
    out.pathname = out.pathname
      // project page: /project_modules/<size>/ -> /project_modules/source/
      .replace(/(\/project_modules\/)(?:disp|max_1200|1400|fs)(\/)/, '$1source$2')
      // search grid: /projects/<n>/<hash>.<base64crop>.<ext> -> /projects/<n>/<hash>.<ext>
      .replace(/(\/projects\/\d+\/[0-9a-f]+)\.[A-Za-z0-9_-]{16,}(?=\.[a-z0-9]+$)/i, '$1');
    const url = domSourceFrom(ctx.el) ?? out.href;
    if (url === u.href) return []; // nothing to upgrade -> let genericResolver handle it
    const c: MediaCandidate = { url, kind: 'image', thumbnailSrc: u.href };
    const ext = imageExtFromUrl(url);
    if (ext) c.ext = ext;
    return [c];
  },
};
