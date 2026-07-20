import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { kindFromExt, pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

const ARCHIVES: Record<string, string[]> = {
  'desuarchive.org': ['desu-usergeneratedcontent.xyz'],
  'archive.4plebs.org': ['4pcdn.org', '4plebs.org'],
};

export const foolfuukaResolver: Resolver = {
  id: 'foolfuuka',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && host in ARCHIVES;
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const el = ctx.el;
    const host = pageHost(ctx);
    if (!el || !host) return [];
    const suffixes = ARCHIVES[host];
    if (!suffixes) return [];
    const href =
      el.closest?.('a.thread_image_link')?.getAttribute?.('href') ??
      el.closest?.('article.post, .post')?.querySelector?.('a.thread_image_link')?.getAttribute?.('href') ??
      null;
    const raw = href && href.startsWith('//') ? `https:${href}` : href;
    const full = pinnedDomUrl(raw, suffixes);
    if (!full || full === u.href) return [];
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    const tim = full.match(/\/(\d+)\.[a-z0-9]+$/i)?.[1];
    if (tim) c.mediaKey = `foolfuuka ${host} ${tim}`;
    return [c];
  },
};
