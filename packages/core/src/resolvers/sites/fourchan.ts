import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { kindFromExt, pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

const HOSTS = new Set(['boards.4chan.org', 'boards.4channel.org']);
const IMG_HOSTS = ['4cdn.org'];

/**
 * 4chan thread resolver. Each post's thumbnail is `<tim>s.jpg` on i.4cdn.org; the
 * full file is `<tim><ext>` on the same host, where the **real** extension
 * (.png/.gif/.webm/.jpg) lives ONLY in the post markup — the thumbnail is always
 * a forced `.jpg`, so the ext is never guessed. The full URL is the href of the
 * post's `a.fileThumb` (protocol-relative `//i.4cdn.org/…`); the `.fileText`
 * anchor is a fallback and carries the original filename. Images and webm are
 * handled identically (direct file, no HLS). Archives (desuarchive/4plebs) use a
 * different engine + CDN and are intentionally out of scope. Network-free.
 */
export const fourchanResolver: Resolver = {
  id: 'fourchan',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && HOSTS.has(host);
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const el = ctx.el;
    if (!el) return [];
    const href =
      el.closest?.('a.fileThumb')?.getAttribute?.('href') ??
      el.closest?.('.file')?.querySelector?.('a.fileThumb')?.getAttribute?.('href') ??
      el.closest?.('.post, .postContainer')?.querySelector?.('.fileText a')?.getAttribute?.('href') ??
      null;
    const raw = href && href.startsWith('//') ? `https:${href}` : href;
    const full = pinnedDomUrl(raw, IMG_HOSTS);
    if (!full || full === u.href) return [];
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    const tim = full.match(/\/(\d+)\.[a-z0-9]+$/i)?.[1];
    if (tim) c.mediaKey = `4chan ${tim}`;
    return [c];
  },
};
