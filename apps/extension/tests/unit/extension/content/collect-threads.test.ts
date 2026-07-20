/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.threads.com/@vaishnavi_buddharaju/media" }
 *
 * End-to-end proof that collectMedia() surfaces Threads grid media at FULL
 * resolution. A Threads profile grid displays a small thumbnail (`currentSrc`)
 * but ships the original (up to ~2610w) in each <img>'s `srcset`; because every
 * size-variant shares one cdninstagram pathname, canonicalSrcKey collapses them
 * to one item and — without the Threads resolver — the first-seen thumbnail would
 * win. jsdom's `location` is immutable at runtime, so the threads.com host is
 * pinned per file via `@vitest-environment-options`. Uses the REAL registry (no
 * mocks) so the item round-trips through threadsResolver.
 */
import { collectMedia } from '@/extension/content/collect';

const BASE = 'https://scontent-del2-2.cdninstagram.com/v/t51.82787-15/742241727_18.jpg';
const THUMB = `${BASE}?stp=dst-jpg_e35_s240x240&_nc=a`;
const ORIGINAL = `${BASE}?stp=dst-jpg_e35_s2610x2610&_nc=a`;
const SRCSET = [
  `${ORIGINAL} 2610w`,
  `${BASE}?stp=dst-jpg_e35_s1080x1080&_nc=a 1080w`,
  `${BASE}?stp=dst-jpg_e35_s640x640&_nc=a 640w`,
  `${THUMB} 240w`,
].join(', ');

describe('collectMedia — Threads profile grid', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects the full-resolution srcset original, not the displayed thumbnail', () => {
    document.body.innerHTML = `<img src="${THUMB}" srcset="${SRCSET}" alt="Photo by X">`;

    const srcs = collectMedia().map((m) => m.src);

    expect(srcs).toContain(ORIGINAL);
    expect(srcs).not.toContain(THUMB);
  });

  it('collapses every size-variant of one photo to a single (full-res) item', () => {
    document.body.innerHTML = `<img src="${THUMB}" srcset="${SRCSET}" alt="Photo by X">`;

    const cdnItems = collectMedia().filter((m) => /cdninstagram\.com/.test(m.src));

    expect(cdnItems).toHaveLength(1);
    expect(cdnItems[0].src).toBe(ORIGINAL);
    expect(cdnItems[0].width).toBe(2610);
  });
});
