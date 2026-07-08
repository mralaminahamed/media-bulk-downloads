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

  it('returns the raw src for an unparseable input', () => {
    expect(canonicalSrcKey('not a url')).toBe('not a url');
  });

  it('is idempotent — re-keying a canonical key is a no-op', () => {
    const k = canonicalSrcKey(fbA);
    expect(canonicalSrcKey(k)).toBe(k);
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
