import { passesSettingsFilters, filterImagesBySettings, applyToolbarFilters, isExcluded, filterExcluded, isPendingOrStream, ExcludedMatchers, deriveFilterOptions } from '@mbd/core/collection/filters';
import { ImageInfo, SettingsData, FilterOptions } from '@mbd/core/types';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { DEFAULT_FILTERS } from '@/extension/popup/components/FilterToolbar';

const base: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 400,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
  saveAs: false,
  notifyOnComplete: false,
  convertImagesTo: 'off',
  convertMetadata: 'preserve',
  namingMode: 'prefixed',
  thumbnailSize: 120,
  previewSize: 360,
  bubbleEnabled: false,
  bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
  bubbleWidth: 440,
  bubbleHeight: 560,
  bubblePanelPlacement: 'anchored',
  bubblePanelPoint: { x: 40, y: 40 },
  resolveOriginals: false,
  sankakuAuthedOriginals: false,
  captureHlsStreams: false, streamQuality: 'auto', audioFormat: 'm4a', metadataSidecar: false, nearDuplicateThreshold: 8,
  downloadConcurrency: 5,
  excludeEmoji: false,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
  smartPageDefaults: false,
  rememberScanBehaviour: true,
  skipDuplicateDownloads: true,
};

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'x.jpg', alt: '', width: 100, height: 100, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
});

describe('passesSettingsFilters', () => {
  it('keeps everything with default settings', () => {
    expect(passesSettingsFilters(img({}), base)).toBe(true);
  });

  it('applies the minimum size floor when dimensions are known', () => {
    const settings = { ...base, minimumImageSize: 75 };
    expect(passesSettingsFilters(img({ width: 100, height: 100 }), settings)).toBe(true);
    expect(passesSettingsFilters(img({ width: 50, height: 50 }), settings)).toBe(false);
  });

  it('never drops images with unknown dimensions (srcset / background)', () => {
    const settings = { ...base, minimumImageSize: 500 };
    expect(passesSettingsFilters(img({ width: 0, height: 0 }), settings)).toBe(true);
  });

  it('keeps a half-known item — enforces the floor only on the known dimension', () => {
    const settings = { ...base, minimumImageSize: 200 };
    expect(passesSettingsFilters(img({ width: 500, height: 0 }), settings)).toBe(true);
    expect(passesSettingsFilters(img({ width: 0, height: 500 }), settings)).toBe(true);
    expect(passesSettingsFilters(img({ width: 50, height: 0 }), settings)).toBe(false);
  });

  it('excludes base64 images when the setting is on', () => {
    const settings = { ...base, excludeBase64Images: true };
    expect(passesSettingsFilters(img({ isBase64: true }), settings)).toBe(false);
    expect(passesSettingsFilters(img({ isBase64: false }), settings)).toBe(true);
  });

  it('hides HLS streams unless capture is enabled', () => {
    const stream = img({ src: 'https://cdn.com/live.m3u8', kind: 'video', hlsManifest: 'https://cdn.com/live.m3u8' });
    expect(passesSettingsFilters(stream, base)).toBe(false);
    expect(passesSettingsFilters(img({}), base)).toBe(true);
    expect(passesSettingsFilters(stream, { ...base, captureHlsStreams: true })).toBe(true);
  });

  it('excludes emoji images when the setting is on', () => {
    const settings = { ...base, excludeEmoji: true };
    expect(passesSettingsFilters(img({ src: 'https://abs.twimg.com/emoji/v2/svg/1f9f8.svg' }), settings)).toBe(false);
    expect(passesSettingsFilters(img({ src: 'https://pbs.twimg.com/media/x.jpg' }), settings)).toBe(true);
  });
  it('keeps emoji images when the setting is off', () => {
    expect(passesSettingsFilters(img({ src: 'https://abs.twimg.com/emoji/v2/svg/1f9f8.svg' }), base)).toBe(true);
  });
});

describe('isPendingOrStream', () => {
  it('is true for a pending (unresolved) video', () => {
    expect(isPendingOrStream(img({ kind: 'video', unresolvedVideo: true }))).toBe(true);
  });
  it('is true for a pending (unresolved) image', () => {
    expect(isPendingOrStream(img({ unresolvedImage: true }))).toBe(true);
  });
  it('is true for an HLS stream', () => {
    expect(isPendingOrStream(img({ kind: 'video', hlsManifest: 'https://cdn.com/live.m3u8' }))).toBe(true);
  });
  it('is false for a plain, already-real image', () => {
    expect(isPendingOrStream(img({}))).toBe(false);
  });
});

describe('filterImagesBySettings', () => {
  it('filters a list by both size and base64 rules', () => {
    const images = [
      img({ src: 'big.jpg', width: 200, height: 200, isBase64: false }),
      img({ src: 'small.jpg', width: 10, height: 10, isBase64: false }),
      img({ src: 'data', width: 0, height: 0, isBase64: true }),
    ];
    const result = filterImagesBySettings(images, { ...base, minimumImageSize: 50, excludeBase64Images: true });
    expect(result.map((i) => i.src)).toEqual(['big.jpg']);
  });
});

const toolbarBase: Omit<ImageInfo, 'kind' | 'type' | 'src'> = {
  alt: '', width: 0, height: 0, fileSize: 0, isBase64: false,
};
const item = (over: Partial<ImageInfo>): ImageInfo =>
  ({ ...toolbarBase, src: 'x', type: 'png', kind: 'image', ...over }) as ImageInfo;

const F = (over: Partial<FilterOptions>): FilterOptions =>
  ({ mediaKind: 'all', imageType: 'all', minSize: 0, includeBase64: true, sizeBucket: 'all', downloadState: 'all', resolveState: 'all', duplicateState: 'unique', search: '', sortBy: 'default', sortDir: 'desc', ...over });

describe('applyToolbarFilters — resolveState (fetched / pending)', () => {
  const items = [
    item({ src: 'ready', kind: 'image' }),
    item({ src: 'pendVid', kind: 'video', type: 'mp4', unresolvedVideo: true }),
    item({ src: 'pendImg', kind: 'image', unresolvedImage: true }),
  ];
  it('keeps everything when resolveState is all', () => {
    expect(applyToolbarFilters(items, F({})).length).toBe(3);
  });
  it('pending keeps only items awaiting resolve', () => {
    expect(applyToolbarFilters(items, F({ resolveState: 'pending' })).map((i) => i.src)).toEqual(['pendVid', 'pendImg']);
  });
  it('fetched keeps only resolved, directly-downloadable items', () => {
    expect(applyToolbarFilters(items, F({ resolveState: 'fetched' })).map((i) => i.src)).toEqual(['ready']);
  });
});

describe('applyToolbarFilters — mediaKind', () => {
  const items = [
    item({ src: 'a', kind: 'image', type: 'png' }),
    item({ src: 'b', kind: 'video', type: 'mp4' }),
    item({ src: 'c', kind: 'audio', type: 'mp3' }),
  ];
  it('keeps all kinds when mediaKind is all', () => {
    expect(applyToolbarFilters(items, F({})).length).toBe(3);
  });
  it('filters to a single kind', () => {
    expect(applyToolbarFilters(items, F({ mediaKind: 'video' })).map((i) => i.src)).toEqual(['b']);
  });
  it('never hides av by size bucket (unknown dims)', () => {
    expect(applyToolbarFilters(items, F({ sizeBucket: 'large' })).some((i) => i.kind === 'video')).toBe(true);
  });
});

describe('applyToolbarFilters — size buckets (known dimensions)', () => {
  const sized = [
    item({ src: 'tiny', width: 100, height: 80 }),      // edge 100  -> small
    item({ src: 'mid', width: 512, height: 400 }),       // edge 512  -> medium
    item({ src: 'big', width: 2000, height: 1200 }),     // edge 2000 -> large
    item({ src: 'edge256', width: 256, height: 10 }),    // edge 256  -> medium (lower bound, inclusive)
    item({ src: 'edge1024', width: 1024, height: 10 }),  // edge 1024 -> large (upper bound of medium is exclusive)
  ];
  it('small keeps only items whose longest edge is under 256', () => {
    expect(applyToolbarFilters(sized, F({ sizeBucket: 'small' })).map((i) => i.src)).toEqual(['tiny']);
  });
  it('medium keeps 256 <= edge < 1024 (256 inclusive, 1024 exclusive)', () => {
    expect(applyToolbarFilters(sized, F({ sizeBucket: 'medium' })).map((i) => i.src)).toEqual(['mid', 'edge256']);
  });
  it('large keeps edge >= 1024', () => {
    expect(applyToolbarFilters(sized, F({ sizeBucket: 'large' })).map((i) => i.src)).toEqual(['big', 'edge1024']);
  });
  it('still never hides an item with unknown dimensions from a size bucket', () => {
    const withUnknown = [...sized, item({ src: 'unknown', width: 0, height: 0 })];
    expect(applyToolbarFilters(withUnknown, F({ sizeBucket: 'large' })).map((i) => i.src)).toContain('unknown');
  });
});

describe('applyToolbarFilters — format narrowing within a kind', () => {
  it('narrows video items by format', () => {
    const videoItems = [
      item({ src: 'v1', kind: 'video', type: 'mp4' }),
      item({ src: 'v2', kind: 'video', type: 'webm' }),
    ];
    expect(
      applyToolbarFilters(videoItems, F({ mediaKind: 'video', imageType: 'mp4' })).map((i) => i.src),
    ).toEqual(['v1']);
  });

  it('with kind=all, a specific image format narrows images but keeps video/audio', () => {
    const mixed = [
      item({ src: 'a', kind: 'image', type: 'png' }),
      item({ src: 'b', kind: 'image', type: 'jpeg' }),
      item({ src: 'v', kind: 'video', type: 'mp4' }),
      item({ src: 'm', kind: 'audio', type: 'mp3' }),
    ];
    expect(applyToolbarFilters(mixed, F({ mediaKind: 'all', imageType: 'png' })).map((i) => i.src))
      .toEqual(['a', 'v', 'm']);
  });
});

describe('applyToolbarFilters — search', () => {
  const items = [
    item({ src: 'https://cdn/sunset-beach.jpg', alt: 'A calm evening', type: 'jpeg' }),
    item({ src: 'https://cdn/logo.png', alt: 'Brand logo', type: 'png' }),
    item({ src: 'https://cdn/clip.mp4', alt: '', type: 'mp4', kind: 'video' }),
  ];
  it('matches on filename', () => {
    expect(applyToolbarFilters(items, F({ search: 'sunset' })).map((i) => i.src)).toEqual(['https://cdn/sunset-beach.jpg']);
  });
  it('matches on alt text, case-insensitively', () => {
    expect(applyToolbarFilters(items, F({ search: 'BRAND' })).map((i) => i.src)).toEqual(['https://cdn/logo.png']);
  });
  it('matches on type', () => {
    expect(applyToolbarFilters(items, F({ search: 'mp4' })).map((i) => i.src)).toEqual(['https://cdn/clip.mp4']);
  });
  it('matches on the URL', () => {
    expect(applyToolbarFilters(items, F({ search: 'cdn/logo' })).map((i) => i.src)).toEqual(['https://cdn/logo.png']);
  });
  it('an empty/whitespace query keeps everything', () => {
    expect(applyToolbarFilters(items, F({ search: '   ' }))).toHaveLength(3);
  });

  it('treats an item with no alt as an empty alt (nullish-coalesce fallback)', () => {
    const noAlt = item({ src: 'https://cdn/pic.jpg', alt: undefined, type: 'png' });
    expect(applyToolbarFilters([noAlt], F({ search: 'png' })).map((i) => i.src)).toEqual(['https://cdn/pic.jpg']);
    expect(applyToolbarFilters([noAlt], F({ search: 'nomatch' }))).toHaveLength(0);
  });

  it('treats an undefined search filter as "no query" (keeps everything)', () => {
    const noSearch = { ...F({}), search: undefined } as unknown as FilterOptions;
    expect(applyToolbarFilters(items, noSearch)).toHaveLength(3);
  });
});

describe('applyToolbarFilters — min-size (bytes) + base64', () => {
  const sizedItems = [
    item({ src: 'big', fileSize: 500 * 1024 }),    // 500 KB
    item({ src: 'small', fileSize: 10 * 1024 }),   // 10 KB — below a 100 KB floor
    item({ src: 'unknown', fileSize: 0 }),          // unknown size never dropped by min-size
  ];
  it('drops items below the KB min-size, keeping unknown-size items', () => {
    expect(applyToolbarFilters(sizedItems, F({ minSize: 100 })).map((i) => i.src)).toEqual(['big', 'unknown']);
  });
  it('a zero min-size disables the byte floor entirely', () => {
    expect(applyToolbarFilters(sizedItems, F({ minSize: 0 })).map((i) => i.src)).toEqual(['big', 'small', 'unknown']);
  });
  it('a non-finite min-size is treated as 0 (no floor) rather than NaN*1024', () => {
    const noFloor = { ...F({}), minSize: Infinity } as FilterOptions;
    expect(applyToolbarFilters(sizedItems, noFloor)).toHaveLength(3);
    const nanFloor = { ...F({}), minSize: NaN } as FilterOptions;
    expect(applyToolbarFilters(sizedItems, nanFloor)).toHaveLength(3);
  });

  const base64Items = [
    item({ src: 'raster', isBase64: false }),
    item({ src: 'inlined', isBase64: true }),
  ];
  it('hides base64 items when includeBase64 is off', () => {
    expect(applyToolbarFilters(base64Items, F({ includeBase64: false })).map((i) => i.src)).toEqual(['raster']);
  });
  it('keeps base64 items when includeBase64 is on', () => {
    expect(applyToolbarFilters(base64Items, F({ includeBase64: true })).map((i) => i.src)).toEqual(['raster', 'inlined']);
  });
});

describe('applyToolbarFilters — sort', () => {
  const items = [
    item({ src: 'https://cdn/b.jpg', fileSize: 200, width: 10, height: 10, type: 'png' }),
    item({ src: 'https://cdn/a.jpg', fileSize: 100, width: 40, height: 40, type: 'jpeg' }),
    item({ src: 'https://cdn/c.jpg', fileSize: 0, width: 0, height: 0, type: 'gif' }),
  ];
  it('leaves collection order when sortBy is default', () => {
    expect(applyToolbarFilters(items, F({})).map((i) => i.src)).toEqual(['https://cdn/b.jpg', 'https://cdn/a.jpg', 'https://cdn/c.jpg']);
  });
  it('sorts by name ascending', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'name', sortDir: 'asc' })).map((i) => i.src)).toEqual([
      'https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg',
    ]);
  });
  it('sorts by size descending, unknown size last', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'size', sortDir: 'desc' })).map((i) => i.fileSize)).toEqual([200, 100, 0]);
  });
  it('sorts by size ascending with unknown still last', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'size', sortDir: 'asc' })).map((i) => i.fileSize)).toEqual([100, 200, 0]);
  });
  it('sorts by dimensions (pixel area) descending', () => {
    expect(applyToolbarFilters(items, F({ sortBy: 'dimensions', sortDir: 'desc' })).map((i) => i.src)).toEqual([
      'https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg',
    ]);
  });
  it('does not reorder the input array in place', () => {
    const input = [...items];
    applyToolbarFilters(input, F({ sortBy: 'name', sortDir: 'asc' }));
    expect(input.map((i) => i.src)).toEqual(['https://cdn/b.jpg', 'https://cdn/a.jpg', 'https://cdn/c.jpg']);
  });

  it('sorts by type, breaking ties on the filename', () => {
    const typed = [
      item({ src: 'https://cdn/zebra.gif', type: 'gif' }),
      item({ src: 'https://cdn/apple.jpeg', type: 'jpeg' }),
      item({ src: 'https://cdn/alpha.gif', type: 'gif' }),
    ];
    expect(applyToolbarFilters(typed, F({ sortBy: 'type', sortDir: 'asc' })).map((i) => i.src)).toEqual([
      'https://cdn/alpha.gif', 'https://cdn/zebra.gif', 'https://cdn/apple.jpeg',
    ]);
  });

  it('sorts by name using the raw src when a name cannot be derived (data: URI)', () => {
    const named = [
      item({ src: 'data:image/png;base64,ZZZ' }),
      item({ src: 'https://cdn/aaa.jpg' }),
    ];
    expect(applyToolbarFilters(named, F({ sortBy: 'name', sortDir: 'asc' })).map((i) => i.src)).toEqual([
      'https://cdn/aaa.jpg', 'data:image/png;base64,ZZZ',
    ]);
  });

  it('keeps every unknown-size item last and stable when several sizes are 0', () => {
    const mixed = [
      item({ src: 'k300', fileSize: 300 }),
      item({ src: 'u0a', fileSize: 0 }),
      item({ src: 'k100', fileSize: 100 }),
      item({ src: 'u0b', fileSize: 0 }),
    ];
    expect(applyToolbarFilters(mixed, F({ sortBy: 'size', sortDir: 'desc' })).map((i) => i.src)).toEqual([
      'k300', 'k100', 'u0a', 'u0b',
    ]);
  });
});

describe('isExcluded / filterExcluded', () => {
  const m: ExcludedMatchers = { urls: SrcKeySet.from(['https://x/a.png']), hosts: new Set(['ads.com']) };
  it('matches an exact url', () => {
    expect(isExcluded('https://x/a.png', m)).toBe(true);
  });
  it('matches by host (registrable-domain scoped)', () => {
    expect(isExcluded('https://cdn.ads.com/banner.gif', m)).toBe(true);
  });
  it('host exclusion covers sibling subdomains / rotating CDN edges', () => {
    expect(isExcluded('https://static.ads.com/x.png', m)).toBe(true);
    expect(isExcluded('https://ads.com/y.png', m)).toBe(true);
    expect(isExcluded('https://notads.com/z.png', m)).toBe(false);
  });
  it('does not match an unrelated src', () => {
    expect(isExcluded('https://x/keep.png', m)).toBe(false);
  });
  it('is safe for a hostless (data:) src', () => {
    expect(isExcluded('data:image/png;base64,AAAA', m)).toBe(false);
  });
  it('filterExcluded drops only excluded items', () => {
    const img = (src: string) => ({ src, alt: '', width: 0, height: 0, type: 'png', fileSize: 0, isBase64: false, kind: 'image' as const });
    const items = [img('https://x/a.png'), img('https://cdn.ads.com/b.gif'), img('https://x/keep.png')];
    expect(filterExcluded(items, m).map((i) => i.src)).toEqual(['https://x/keep.png']);
  });

  it('filterExcluded returns the list untouched (same reference) when no matchers are set', () => {
    const empty: ExcludedMatchers = { urls: SrcKeySet.from([]), hosts: new Set() };
    const img = (src: string) => ({ src, alt: '', width: 0, height: 0, type: 'png', fileSize: 0, isBase64: false, kind: 'image' as const });
    const items = [img('https://x/a.png'), img('https://cdn.ads.com/b.gif')];
    expect(filterExcluded(items, empty)).toBe(items);
  });

  it('filterExcluded still filters when only the host set is populated (urls empty)', () => {
    const hostsOnly: ExcludedMatchers = { urls: SrcKeySet.from([]), hosts: new Set(['ads.com']) };
    const img = (src: string) => ({ src, alt: '', width: 0, height: 0, type: 'png', fileSize: 0, isBase64: false, kind: 'image' as const });
    const items = [img('https://cdn.ads.com/b.gif'), img('https://x/keep.png')];
    expect(filterExcluded(items, hostsOnly).map((i) => i.src)).toEqual(['https://x/keep.png']);
  });

  it('matches a re-signed / resized CDN variant of an excluded image via its canonical key', () => {
    const excluded = 'https://scontent-del1-1.xx.fbcdn.net/v/t39/photo_123.jpg?oh=AAA&oe=BBB';
    const variant = 'https://scontent-bom2-3.xx.fbcdn.net/v/t39/photo_123.jpg?oh=CCC&oe=DDD';
    const fbMatchers: ExcludedMatchers = { urls: SrcKeySet.from([excluded]), hosts: new Set() };
    expect(isExcluded(variant, fbMatchers)).toBe(true);
    expect(isExcluded('https://scontent-bom2-3.xx.fbcdn.net/v/t39/other_999.jpg?oh=X', fbMatchers)).toBe(false);
  });
});

describe('applyToolbarFilters — downloadState', () => {
  const items = [
    { src: 'a', filename: 'a.jpg', alt: '', width: 10, height: 10, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const },
    { src: 'b', filename: 'b.jpg', alt: '', width: 10, height: 10, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const },
  ];
  const base = { ...DEFAULT_FILTERS };
  const isDownloaded = (i: { src: string }) => i.src === 'a';

  it('all keeps everything (predicate ignored)', () => {
    expect(applyToolbarFilters(items, { ...base, downloadState: 'all' }, isDownloaded)).toHaveLength(2);
  });
  it('downloaded keeps only predicate-true items', () => {
    const out = applyToolbarFilters(items, { ...base, downloadState: 'downloaded' }, isDownloaded);
    expect(out.map((i) => i.src)).toEqual(['a']);
  });
  it('not-downloaded keeps only predicate-false items', () => {
    const out = applyToolbarFilters(items, { ...base, downloadState: 'not-downloaded' }, isDownloaded);
    expect(out.map((i) => i.src)).toEqual(['b']);
  });
  it('composes with another filter (downloaded + a search that excludes a)', () => {
    const out = applyToolbarFilters(items, { ...base, downloadState: 'downloaded', search: 'b' }, isDownloaded);
    expect(out).toHaveLength(0);
  });
  it('with no predicate, downloaded keeps nothing (default () => false)', () => {
    expect(applyToolbarFilters(items, { ...base, downloadState: 'downloaded' })).toHaveLength(0);
  });
});

describe('deriveFilterOptions', () => {
  it('lists only present kinds, always including all (canonical order)', () => {
    const opts = deriveFilterOptions([img({ kind: 'image' }), img({ kind: 'video', type: 'mp4' })]);
    expect(opts.kinds).toEqual(['all', 'image', 'video']);
  });

  it('groups formats by kind (video family)', () => {
    const opts = deriveFilterOptions([img({ kind: 'image', type: 'png' }), img({ kind: 'video', type: 'mp4' })]);
    expect(opts.formats.video).toEqual(['all', 'mp4']);
    expect(opts.formats.image).toEqual(['all', 'png']);
  });

  it('lists present formats per kind in first-seen order, always including all', () => {
    const opts = deriveFilterOptions([
      img({ kind: 'image', type: 'png' }),
      img({ kind: 'image', type: 'avif' }),
    ]);
    expect(opts.formats.image).toEqual(['all', 'png', 'avif']);
  });

  it('surfaces a novel format outside the hardcoded list', () => {
    const opts = deriveFilterOptions([img({ kind: 'image', type: 'jxl' })]);
    expect(opts.formats.image).toContain('jxl');
  });

  it('excludes the "unknown" placeholder type', () => {
    const opts = deriveFilterOptions([img({ kind: 'image', type: 'unknown' })]);
    expect(opts.formats.image).toEqual(['all']);
  });

  it('derives size buckets from known dimensions only', () => {
    const opts = deriveFilterOptions([
      img({ width: 100, height: 100 }), // small
      img({ width: 500, height: 500 }), // medium
      img({ width: 0, height: 0 }),     // unknown → 'all' only
    ]);
    expect(opts.sizeBuckets).toEqual(['all', 'small', 'medium']);
  });

  it('a single-format page yields one format plus all', () => {
    const opts = deriveFilterOptions([img({ kind: 'image', type: 'jpeg' })]);
    expect(opts.formats.image).toEqual(['all', 'jpeg']);
  });
});

describe('applyToolbarFilters — duplicateState (#198)', () => {
  const items = [
    item({ src: 'keeper' }),
    item({ src: 'dupe', nearDuplicate: true, duplicateGroupId: 'keeper' }),
    item({ src: 'plain' }),
  ];

  it("hides near-duplicates by default ('unique')", () => {
    expect(applyToolbarFilters(items, F({ duplicateState: 'unique' })).map((i) => i.src)).toEqual(['keeper', 'plain']);
  });

  it("shows everything with 'all'", () => {
    expect(applyToolbarFilters(items, F({ duplicateState: 'all' })).map((i) => i.src)).toEqual(['keeper', 'dupe', 'plain']);
  });

  it("shows only near-duplicates with 'duplicates'", () => {
    expect(applyToolbarFilters(items, F({ duplicateState: 'duplicates' })).map((i) => i.src)).toEqual(['dupe']);
  });

  it('is a no-op before any pass has marked items', () => {
    const unmarked = [item({ src: 'a' }), item({ src: 'b' })];
    expect(applyToolbarFilters(unmarked, F({ duplicateState: 'unique' })).length).toBe(2);
  });
});
