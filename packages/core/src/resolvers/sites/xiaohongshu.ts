import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

// RED / Xiaohongshu media CDN. Signed URL shape:
//   https://sns-webpic-qc.xhscdn.com/<ts>/<hash>/<bucket>/<token>!<rendition>
// <ts> (12-digit) + <hash> (32-hex) are a per-rendition signature that rotates on
// every re-sign; <bucket>/<token> is the note's stable fileId; the format lives in
// the rendition tag (…_webp_3), not a path extension. RED runs two CDN families for
// the identical signed shape: China (xhscdn.com) and international / rednote.com
// (rednotecdn.com, e.g. sns-web-i10.rednotecdn.com) — the only differences are the
// host and an extra `?src=` query, which `u.pathname` already excludes. The
// <token> fileId is RED's global image id, so both families fold to one identity.
const XHS_HOST = /(?:^|\.)(?:xhscdn|rednotecdn)\.com$/i;
const XHS_SIGNED = /^\/\d{6,}\/[0-9a-f]{32}\/([a-z0-9_]+\/[A-Za-z0-9_-]+)!([^/]*)$/i;

// The rendition tag carries the format (e.g. nd_dft_wlteh_webp_3); the path has no
// file extension, so derive one for a correct download filename.
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
