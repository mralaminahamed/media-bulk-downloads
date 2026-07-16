import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { kindFromExt, pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

// FoolFuuka 4chan archives. A different engine + per-archive media CDN than
// boards.4chan.org (fourchan.ts), so gated and host-pinned separately. Keyed by
// PAGE host → the media host suffix(es) the archive serves originals from.
//
// Markup confirmed from the FoolFuuka default theme (board_comment.php): each
// post's full media is the href of `<a class="thread_image_link">` (which wraps
// the lazyloaded `img.post_image` thumbnail). Read element-scoped so a thread's
// many posts each resolve their own file. The href is `get_media_link()` — the
// archive's own CDN — with `get_remote_media_link()` as a source fallback; the
// host-pin keeps only the archive CDN, so a remote/foreign fallback fails safe.
//
// Deferred from #402/#426. The archive PAGES 403 server-side fetchers (anti-bot),
// so the selectors are from the open-source template, NOT a live DOM capture —
// NEEDS-LIVE-CONFIRMATION. Fail-closed until then: a miss returns [] (no upgrade),
// never a wrong/off-host URL.
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
    // Element-scoped to the collected thumbnail's own post file.
    const href =
      el.closest?.('a.thread_image_link')?.getAttribute?.('href') ??
      el.closest?.('article.post, .post')?.querySelector?.('a.thread_image_link')?.getAttribute?.('href') ??
      null;
    // Archive hrefs may be protocol-relative (//host/…); give them a scheme.
    const raw = href && href.startsWith('//') ? `https:${href}` : href;
    const full = pinnedDomUrl(raw, suffixes);
    if (!full || full === u.href) return []; // no media link / already the original
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    const tim = full.match(/\/(\d+)\.[a-z0-9]+$/i)?.[1];
    if (tim) c.mediaKey = `foolfuuka ${host} ${tim}`;
    return [c];
  },
};
