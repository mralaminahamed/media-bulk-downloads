import { partitionByDownloaded, uniquifyBatchNames } from '@/extension/shared/collection/download-dedupe';
import { SrcKeySet } from '@/extension/shared/collection/canonical';
import { ImageInfo } from '@/types';

const img = (src: string): ImageInfo => ({ src, kind: 'image', type: 'png' } as ImageInfo);

describe('partitionByDownloaded', () => {
  it('splits images by whether their canonical src is already on disk', () => {
    const onDisk = SrcKeySet.from(['https://x/a.png']);
    const { keep, skipped } = partitionByDownloaded([img('https://x/a.png'), img('https://x/b.png')], onDisk);
    expect(keep.map((i) => i.src)).toEqual(['https://x/b.png']);
    expect(skipped.map((i) => i.src)).toEqual(['https://x/a.png']);
  });
  it('keeps everything when the on-disk set is empty', () => {
    const { keep, skipped } = partitionByDownloaded([img('https://x/a.png')], SrcKeySet.from([]));
    expect(keep).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });
  it('preserves order', () => {
    const onDisk = SrcKeySet.from(['https://x/b.png']);
    const { keep } = partitionByDownloaded([img('https://x/a.png'), img('https://x/b.png'), img('https://x/c.png')], onDisk);
    expect(keep.map((i) => i.src)).toEqual(['https://x/a.png', 'https://x/c.png']);
  });
});

describe('uniquifyBatchNames', () => {
  it('returns a collision-free batch unchanged', () => {
    expect(uniquifyBatchNames(['a.png', 'b.png'])).toEqual(['a.png', 'b.png']);
  });
  it('de-collides repeats with -2, -3 before the extension', () => {
    expect(uniquifyBatchNames(['image.png', 'image.png', 'image.png'])).toEqual(['image.png', 'image-2.png', 'image-3.png']);
  });
  it('disambiguates only the basename, preserving the directory', () => {
    expect(uniquifyBatchNames(['dir/x.jpg', 'dir/x.jpg'])).toEqual(['dir/x.jpg', 'dir/x-2.jpg']);
  });
  it('does not collide across different directories', () => {
    expect(uniquifyBatchNames(['a/img.png', 'b/img.png'])).toEqual(['a/img.png', 'b/img.png']);
  });
  it('detects collisions case-insensitively (Windows/macOS FS)', () => {
    expect(uniquifyBatchNames(['IMG.PNG', 'img.png'])).toEqual(['IMG.PNG', 'img-2.png']);
  });
  it('handles a basename with no extension', () => {
    expect(uniquifyBatchNames(['photo', 'photo'])).toEqual(['photo', 'photo-2']);
  });
  it('de-collides a name that already ends in -2', () => {
    expect(uniquifyBatchNames(['a-2.png', 'a-2.png'])).toEqual(['a-2.png', 'a-2-2.png']);
  });
});
