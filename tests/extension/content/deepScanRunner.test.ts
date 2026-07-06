jest.mock('@/extension/shared/collection/deepScan', () => {
  const actual = jest.requireActual('@/extension/shared/collection/deepScan');
  return { __esModule: true, ...actual, runDeepScan: jest.fn(() => Promise.resolve([])) };
});

import { buildDeepScanDeps, nestedScrollables, startDeepScan, findLoadMoreButtons } from '@/extension/content/deepScanRunner';
import { runDeepScan, DEEP_SCAN_DEFAULTS } from '@/extension/shared/collection/deepScan';

const mockMetrics = (el: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop: number) => {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
};

describe('buildDeepScanDeps', () => {
  it('produces deps that restore the original scroll position', () => {
    window.scrollTo(0, 0);
    const { deps } = buildDeepScanDeps(() => {});
    // jsdom has no layout; just assert the binding shape + restoreScroll is callable.
    expect(typeof deps.scrollStep).toBe('function');
    expect(typeof deps.waitForQuiet).toBe('function');
    expect(() => deps.restoreScroll()).not.toThrow();
    expect(deps.collect()).toEqual(expect.any(Array));
  });

  it('waitForQuiet observes attribute mutations so lazy src swaps reset the quiet window', () => {
    // Lazy loaders swap data-src → src on the same node; without attribute
    // observation the quiet timer never resets for those pages.
    interface ObserveOptions {
      attributes?: boolean;
      childList?: boolean;
      subtree?: boolean;
      attributeFilter?: string[];
    }
    const observeSpy = jest.fn();
    const OrigMO = global.MutationObserver;
    class StubMO {
      observe = observeSpy;
      disconnect(): void {}
      takeRecords(): [] { return []; }
    }
    global.MutationObserver = StubMO as unknown as typeof MutationObserver;

    try {
      const { deps } = buildDeepScanDeps(() => {});
      const ctrl = new AbortController();
      // Kick off the quiet wait (resolves on abort below); we only inspect observe().
      void deps.waitForQuiet(ctrl.signal);
      expect(observeSpy).toHaveBeenCalledTimes(1);
      const options = observeSpy.mock.calls[0][1] as ObserveOptions;
      expect(options.attributes).toBe(true);
      expect(options.childList).toBe(true);
      expect(options.subtree).toBe(true);
      expect(options.attributeFilter).toEqual(expect.arrayContaining(['src', 'srcset', 'data-src']));
      ctrl.abort();
    } finally {
      global.MutationObserver = OrigMO;
    }
  });
});

describe('startDeepScan config', () => {
  const mockRun = runDeepScan as jest.Mock;
  beforeEach(() => mockRun.mockClear());

  it('forwards only the caps that are set, keeping defaults for the rest', async () => {
    await startDeepScan(() => {}, new AbortController().signal, { maxScrolls: 7 });
    expect(mockRun).toHaveBeenCalledTimes(1);
    const opts = mockRun.mock.calls[0][1];
    expect(opts.maxScrolls).toBe(7); // overridden
    expect(opts.maxItems).toBe(DEEP_SCAN_DEFAULTS.maxItems); // default
    expect(opts.maxMs).toBe(DEEP_SCAN_DEFAULTS.maxMs); // default
  });

  it('ignores falsy cap overrides and uses all defaults', async () => {
    await startDeepScan(() => {}, new AbortController().signal, { maxItems: 0, maxScrolls: undefined });
    const opts = mockRun.mock.calls[0][1];
    expect(opts.maxItems).toBe(DEEP_SCAN_DEFAULTS.maxItems);
    expect(opts.maxScrolls).toBe(DEEP_SCAN_DEFAULTS.maxScrolls);
  });
});

describe('findLoadMoreButtons', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('matches load/show/view/see-more buttons and role=button, ignores unrelated + anchors', () => {
    document.body.innerHTML =
      '<button id="a">Load more</button>' +
      '<button id="b">Show More Posts</button>' +
      '<div id="c" role="button">See more</div>' +
      '<button id="d">Buy now</button>' +
      '<a id="e" href="/next">Load more</a>'; // anchor would navigate → excluded
    expect(findLoadMoreButtons(document).map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('skips disabled and aria-disabled buttons', () => {
    document.body.innerHTML =
      '<button id="a" disabled>Load more</button>' +
      '<button id="b" aria-disabled="true">Load more</button>';
    expect(findLoadMoreButtons(document)).toHaveLength(0);
  });

  it('matches via aria-label when there is no text', () => {
    document.body.innerHTML = '<button id="a" aria-label="Load more results"><svg></svg></button>';
    expect(findLoadMoreButtons(document).map((e) => e.id)).toEqual(['a']);
  });
});

describe('scrollStep load-more clicking', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('clicks load-more buttons only when opted in', () => {
    document.body.innerHTML = '<button id="lm">Load more</button>';
    const clicks = jest.fn();
    document.getElementById('lm')!.addEventListener('click', clicks);
    buildDeepScanDeps(() => {}, { clickLoadMore: true }).deps.scrollStep();
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('does not click when the option is off (default)', () => {
    document.body.innerHTML = '<button id="lm">Load more</button>';
    const clicks = jest.fn();
    document.getElementById('lm')!.addEventListener('click', clicks);
    buildDeepScanDeps(() => {}).deps.scrollStep();
    expect(clicks).not.toHaveBeenCalled();
  });
});

describe('nestedScrollables', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('finds overflow:auto/scroll containers that still have room to scroll', () => {
    document.body.innerHTML =
      '<div id="auto" style="overflow-y:auto"></div>' +
      '<div id="scroll" style="overflow-y:scroll"></div>' +
      '<div id="visible"></div>';
    const auto = document.getElementById('auto')!;
    const scroll = document.getElementById('scroll')!;
    const visible = document.getElementById('visible')!;
    mockMetrics(auto, 1000, 300, 0);
    mockMetrics(scroll, 1000, 300, 0);
    mockMetrics(visible, 1000, 300, 0); // overflows but overflow-y is visible → excluded
    expect(nestedScrollables(document).map((e) => e.id).sort()).toEqual(['auto', 'scroll']);
  });

  it('ignores containers already scrolled to the bottom', () => {
    document.body.innerHTML = '<div id="done" style="overflow-y:auto"></div>';
    const done = document.getElementById('done')!;
    mockMetrics(done, 1000, 300, 700); // 700 + 300 >= 1000 → at bottom
    expect(nestedScrollables(document)).toHaveLength(0);
  });

  it('ignores elements that do not meaningfully overflow', () => {
    document.body.innerHTML = '<div id="small" style="overflow-y:auto"></div>';
    const small = document.getElementById('small')!;
    mockMetrics(small, 350, 300, 0); // 50px of overflow, under the 200 threshold
    expect(nestedScrollables(document)).toHaveLength(0);
  });
});
