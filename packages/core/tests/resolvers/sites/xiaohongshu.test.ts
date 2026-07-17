import { xiaohongshuResolver } from '@mbd/core/resolvers/sites/xiaohongshu';

const TOK = 'notes_pre_post/1040g3k8321i4pbs37k7g5o5dgbqgbkc6gdrpq90';
const H = '45adde89ae6c42409ccefc665e8ab669';
const detail = (proto = 'https') => `${proto}://sns-webpic-qc.xhscdn.com/202607170815/${H}/${TOK}!nd_dft_wlteh_webp_3`;
const run = (href: string) => xiaohongshuResolver.resolve(new URL(href), { allowNetwork: false });
const m = (href: string) => xiaohongshuResolver.match(new URL(href), { allowNetwork: false });

// International (rednote.com) CDN — same signed shape, served from rednotecdn.com
// instead of xhscdn.com, with an extra ?src= query the resolver must preserve.
const REDNOTE_TOK = 'notes_pre_post/1040g3k0322hharh1mu005papn09i5n1lbf83ci0';
const rednote =
  `https://sns-web-i10.rednotecdn.com/202607170815/${H}/${REDNOTE_TOK}!nd_dft_wlteh_webp_3?src=A`;

describe('xiaohongshuResolver — match', () => {
  it('matches signed RED note-image URLs, not other hosts or non-signed paths', () => {
    expect(m(detail())).toBe(true);
    expect(m('https://cdn.example.com/x.jpg')).toBe(false);
    expect(m('https://sns-webpic-qc.xhscdn.com/static/logo.png')).toBe(false); // no /ts/hash/ prefix
  });

  it('matches signed rednote.com international CDN (rednotecdn.com) note images', () => {
    expect(m(rednote)).toBe(true);
  });
});

describe('xiaohongshuResolver — resolve', () => {
  it('emits an image candidate with fileId mediaKey, webp ext, url intact', () => {
    const [c] = run(detail());
    expect(c).toEqual({ url: detail(), kind: 'image', ext: 'webp', mediaKey: `xhs ${TOK}` });
  });

  it('upgrades an http input to https, signature otherwise intact', () => {
    const [c] = run(detail('http'));
    expect(c.url).toBe(detail('https'));
  });

  it('a cover rendition of the same note carries the same mediaKey', () => {
    const cover = `https://sns-webpic-qc.xhscdn.com/202607170814/${H}/${TOK}!nc_n_webp_mw_1`;
    expect(run(cover)[0].mediaKey).toBe(`xhs ${TOK}`);
  });

  it('normalizes a jpeg rendition tag to a jpg ext', () => {
    const jpeg = `https://sns-webpic-qc.xhscdn.com/202607170815/${H}/${TOK}!nd_dft_wlteh_jpeg_3`;
    const [c] = run(jpeg);
    expect(c).toEqual({ url: jpeg, kind: 'image', ext: 'jpg', mediaKey: `xhs ${TOK}` });
  });

  it('resolves a rednote.com international CDN (rednotecdn.com) note image, preserving ?src=', () => {
    const [c] = run(rednote);
    expect(c).toEqual({
      url: rednote,
      kind: 'image',
      ext: 'webp',
      mediaKey: `xhs ${REDNOTE_TOK}`,
    });
  });
});
