import { canonicalSrcKey, SrcKeySet } from '@/extension/shared/collection/canonical';

describe('canonicalSrcKey', () => {
  // Two loads of the SAME Facebook photo: different edge PoP host AND different
  // signed query (oh/oe/_nc_*), same path.
  const fbA = 'https://scontent-del3-1.xx.fbcdn.net/v/t15.5256-10/739312998_4473652832891496_6461361541517645187_n.jpg?stp=dst-jpg_tt6&_nc_ohc=AAA&oh=00_ONE&oe=6A52D851';
  const fbB = 'https://scontent-bom1-2.xx.fbcdn.net/v/t15.5256-10/739312998_4473652832891496_6461361541517645187_n.jpg?stp=dst-jpg_s960x960&_nc_ohc=BBB&oh=00_TWO&oe=6B00FFFF';

  it('keys the same Facebook image identically across edge host + signed query changes', () => {
    expect(canonicalSrcKey(fbA)).toBe('fbcdn.net/v/t15.5256-10/739312998_4473652832891496_6461361541517645187_n.jpg');
    expect(canonicalSrcKey(fbA)).toBe(canonicalSrcKey(fbB));
  });

  it('keeps different Facebook images distinct (different media id in the path)', () => {
    const other = 'https://scontent-del3-1.xx.fbcdn.net/v/t15.5256-10/111_222222222222222_333_n.jpg?oh=x&oe=y';
    expect(canonicalSrcKey(fbA)).not.toBe(canonicalSrcKey(other));
  });

  it('drops the query for any file-path URL, keeping the host', () => {
    expect(canonicalSrcKey('https://cdn.example.com/a/b/photo.jpg?sig=abc&v=2')).toBe('cdn.example.com/a/b/photo.jpg');
  });

  it('keeps the query for an extension-less (dynamic) path, where it may carry identity', () => {
    expect(canonicalSrcKey('https://site.com/render?id=42')).toBe('site.com/render?id=42');
    expect(canonicalSrcKey('https://site.com/render?id=99')).not.toBe(canonicalSrcKey('https://site.com/render?id=42'));
  });

  it('does not collapse a look-alike host to fbcdn.net (dot boundary)', () => {
    expect(canonicalSrcKey('https://evilfbcdn.net/v/x.jpg?oh=1')).toBe('evilfbcdn.net/v/x.jpg');
  });

  it('keys Instagram cdninstagram.com edge hosts the same as fbcdn.net (same media path)', () => {
    const ig = 'https://scontent-lax3-1.cdninstagram.com/v/t51/id_n.jpg?oh=A&oe=B';
    const fb = 'https://scontent-sea1-1.xx.fbcdn.net/v/t51/id_n.jpg?oh=C&oe=D';
    expect(canonicalSrcKey(ig)).toBe('fbcdn.net/v/t51/id_n.jpg');
    expect(canonicalSrcKey(ig)).toBe(canonicalSrcKey(fb));
  });

  it('keeps two images from the same dynamic script distinct (non-media extension keeps its query)', () => {
    const a = canonicalSrcKey('https://forum.example.com/attachment.php?attachmentid=1');
    const b = canonicalSrcKey('https://forum.example.com/attachment.php?attachmentid=2');
    expect(a).not.toBe(b);
    expect(a).toBe('forum.example.com/attachment.php?attachmentid=1');
  });

  it('strips a rotating cache-buster so an excluded dynamic image stays matched', () => {
    const load1 = canonicalSrcKey('https://ads.example.com/serve?zone=7&cb=1699999999');
    const load2 = canonicalSrcKey('https://ads.example.com/serve?zone=7&cb=1700000042');
    expect(load1).toBe(load2);
    expect(load1).toBe('ads.example.com/serve?zone=7');
  });

  it('is order-independent for identity query params', () => {
    expect(canonicalSrcKey('https://site.com/render?a=1&b=2')).toBe(canonicalSrcKey('https://site.com/render?b=2&a=1'));
  });

  it('collapses size/transform variants of the same dynamic image (universal, any host)', () => {
    // Gravatar: the avatar hash in the path is the identity; ?s= only picks a
    // size, so every size of the same avatar must key identically — the fix that
    // makes exclude/dedup work on any host, not just the fbcdn special case.
    const s52 = canonicalSrcKey('https://secure.gravatar.com/avatar/d8e25969?s=52&d=mm&r=g');
    const s96 = canonicalSrcKey('https://secure.gravatar.com/avatar/d8e25969?s=96&d=mm&r=g');
    expect(s52).toBe(s96);
    // a generic sized CDN endpoint collapses across w/h/quality too
    expect(canonicalSrcKey('https://img.site.com/render?id=7&w=200&h=200&q=80'))
      .toBe(canonicalSrcKey('https://img.site.com/render?id=7&w=1600&h=1600&q=40'));
  });

  it('keeps genuinely different dynamic images distinct despite the transform strip', () => {
    // Only size/format params are stripped — a differing identity param (id) must
    // still split the key, so two different avatars/renditions never merge.
    expect(canonicalSrcKey('https://img.site.com/render?id=7&w=200'))
      .not.toBe(canonicalSrcKey('https://img.site.com/render?id=8&w=200'));
  });

  it('returns the raw src for an unparseable input', () => {
    expect(canonicalSrcKey('not a url')).toBe('not a url');
  });

  it('is idempotent — re-keying a canonical key is a no-op', () => {
    const k = canonicalSrcKey(fbA);
    expect(canonicalSrcKey(k)).toBe(k);
  });
});

describe('SRC_KEY_RULES cross-CDN families', () => {
  it('collapses i0/i1/i2.wp.com edge rotation to one key', () => {
    const a = 'https://i0.wp.com/example.com/wp-content/uploads/2020/01/pic.jpg?resize=768%2C512&ssl=1';
    const b = 'https://i2.wp.com/example.com/wp-content/uploads/2020/01/pic.jpg?resize=1024%2C683&ssl=1';
    expect(canonicalSrcKey(a)).toBe(canonicalSrcKey(b));
  });
  it('keeps two different wp.com images distinct', () => {
    const a = 'https://i0.wp.com/example.com/wp-content/uploads/2020/01/pic.jpg';
    const b = 'https://i0.wp.com/example.com/wp-content/uploads/2020/01/other.jpg';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });
  it('collapses googleusercontent size-suffix variants', () => {
    const a = 'https://lh3.googleusercontent.com/a/ACg8ocK_exampletoken=s96-c';
    const b = 'https://lh3.googleusercontent.com/a/ACg8ocK_exampletoken=s288-c';
    expect(canonicalSrcKey(a)).toBe(canonicalSrcKey(b));
  });
  it('keeps two different googleusercontent assets distinct', () => {
    const a = 'https://lh3.googleusercontent.com/a/ACg8ocK_exampletoken=s96-c';
    const b = 'https://lh3.googleusercontent.com/a/ZZZdifferenttoken=s96-c';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });
  it('collapses imgix transform variants (path is identity)', () => {
    const a = 'https://foo.imgix.net/bar/baz.jpg?w=800&h=600&fit=crop&s=abc';
    const b = 'https://foo.imgix.net/bar/baz.jpg?w=1600&auto=format';
    expect(canonicalSrcKey(a)).toBe(canonicalSrcKey(b));
  });
  it('keeps two different imgix paths distinct', () => {
    const a = 'https://foo.imgix.net/bar/baz.jpg?w=800';
    const b = 'https://foo.imgix.net/bar/qux.jpg?w=800';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });
  it('collapses cloudinary transform + version variants', () => {
    const a = 'https://res.cloudinary.com/demo/image/upload/w_800,c_fill/v1699999999/sample.jpg';
    const b = 'https://res.cloudinary.com/demo/image/upload/w_300,c_scale/v1700000000/sample.jpg';
    expect(canonicalSrcKey(a)).toBe(canonicalSrcKey(b));
  });
  it('keeps two different cloudinary public ids distinct', () => {
    const a = 'https://res.cloudinary.com/demo/image/upload/w_800,c_fill/sample.jpg';
    const b = 'https://res.cloudinary.com/demo/image/upload/w_800,c_fill/other.jpg';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });
  it('collapses twimg name/format rendition variants', () => {
    const a = 'https://pbs.twimg.com/media/FabcXYZ?format=jpg&name=small';
    const b = 'https://pbs.twimg.com/media/FabcXYZ?format=png&name=orig';
    expect(canonicalSrcKey(a)).toBe(canonicalSrcKey(b));
  });
  it('collapses the legacy :size path suffix', () => {
    const a = 'https://pbs.twimg.com/media/FabcXYZ.jpg:large';
    const b = 'https://pbs.twimg.com/media/FabcXYZ.jpg:small';
    expect(canonicalSrcKey(a)).toBe(canonicalSrcKey(b));
  });
  it('keeps two different twimg media ids distinct', () => {
    const a = 'https://pbs.twimg.com/media/FabcXYZ?name=small';
    const b = 'https://pbs.twimg.com/media/Fdef456?name=small';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });

  it('keeps distinct googleusercontent multi-= tokens distinct', () => {
    const a = 'https://lh3.googleusercontent.com/a/AAtokenPART1=AAtokenPART2=s96-c';
    const b = 'https://lh3.googleusercontent.com/a/AAtokenPART1=BBtokenPART2=s96-c';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });

  it('keeps distinct imgix pages of a multi-page source distinct', () => {
    const a = 'https://foo.imgix.net/doc.pdf?page=1';
    const b = 'https://foo.imgix.net/doc.pdf?page=2';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });

  it('keeps a cloudinary vNN-named folder distinct (not a version marker)', () => {
    const a = 'https://res.cloudinary.com/demo/image/upload/blog/v2/hero.jpg';
    const b = 'https://res.cloudinary.com/demo/image/upload/blog/hero.jpg';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });

  it('keeps a cloudinary comma-named folder distinct (not a transform)', () => {
    const a = 'https://res.cloudinary.com/demo/image/upload/folder,name/photo.jpg';
    const b = 'https://res.cloudinary.com/demo/image/upload/photo.jpg';
    expect(canonicalSrcKey(a)).not.toBe(canonicalSrcKey(b));
  });
});

describe('SrcKeySet', () => {
  const fbA = 'https://scontent-del3-1.xx.fbcdn.net/v/t15/739_444_661_n.jpg?oh=ONE&oe=A';
  const fbB = 'https://scontent-bom1-2.xx.fbcdn.net/v/t15/739_444_661_n.jpg?oh=TWO&oe=B'; // same image, new host+query

  it('matches a src by any of its CDN variants', () => {
    const s = SrcKeySet.from([fbA]);
    expect(s.has(fbB)).toBe(true); // recognized despite host+query change
    expect(s.has('https://scontent-x.xx.fbcdn.net/v/t15/OTHER_n.jpg?oh=Z')).toBe(false);
  });

  it('dedups variants of the same image on build', () => {
    expect(SrcKeySet.from([fbA, fbB]).size).toBe(1);
  });

  it('withAdded / withoutSrc are immutable and canonicalize', () => {
    const base = new SrcKeySet();
    const added = base.withAdded(fbA);
    expect(base.size).toBe(0); // original untouched
    expect(added.has(fbB)).toBe(true);
    const removed = added.withoutSrc(fbB); // remove via a different variant
    expect(removed.has(fbA)).toBe(false);
    expect(added.has(fbA)).toBe(true); // withoutSrc didn't mutate `added`
  });
});
