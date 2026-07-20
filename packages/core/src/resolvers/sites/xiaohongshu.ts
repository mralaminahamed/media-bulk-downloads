import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

const XHS_HOST = /(?:^|\.)(?:xhscdn|rednotecdn)\.com$/i;
const XHS_SIGNED = /^\/\d{6,}\/[0-9a-f]{32}\/([a-z0-9_]+\/[A-Za-z0-9_-]+)!([^/]*)$/i;

function extFromRendition(tag: string): string | undefined {
  const m = tag.match(/(?:^|_)(webp|png|jpe?g|hei[cf]|gif|avif)(?:_|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : undefined;
}

/**
 * Xiaohongshu / RED (Tier-1, passive). The displayed <img> already carries the
 * best network-free rendition (WB_DFT, served https), so this resolver does NOT
 * upgrade — it claims RED media URLs before the generic fallback, https-upgrades a
 * raw http src, gives the extension-less path a real ext from the rendition tag,
 * and stamps a stable fileId mediaKey so a note's cover and detail renditions (and
 * re-signs) fold to one row across scans. No rewrite (the signature is path-
 * embedded → a rewrite 404s), no DOM/state read, no network. The seam for a future
 * opt-in authed Tier-2 (a larger/un-watermarked original), which will add a
 * resolveHint here.
 */
export const xiaohongshuResolver: Resolver = {
  id: 'xiaohongshu',
  hosts: ['xhscdn.com', 'rednotecdn.com', 'xiaohongshu.com'], // xhscdn.com (China) + rednotecdn.com (international / rednote.com) are the two CDN families; xiaohongshu.com is inert today (match only accepts the CDN hosts) — seam for a future opt-in authed Tier-2 (RED note API)
  match: (u) => XHS_HOST.test(u.hostname) && XHS_SIGNED.test(u.pathname),
  resolve: (u): MediaCandidate[] => {
    const found = u.pathname.match(XHS_SIGNED);
    if (!found) return [];
    const [, fileId, rendition] = found;
    const url = u.protocol === 'http:' ? `https://${u.href.slice('http://'.length)}` : u.href;
    const ext = extFromRendition(rendition);
    return [{ url, kind: 'image', mediaKey: `xhs ${fileId}`, ...(ext ? { ext } : {}) }];
  },
};
