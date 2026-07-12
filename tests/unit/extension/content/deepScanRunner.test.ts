import type { Mock } from 'vitest';
vi.mock('@/extension/shared/collection/deepScan', async () => {
  const actual = await vi.importActual<typeof import('@/extension/shared/collection/deepScan')>('@/extension/shared/collection/deepScan');
  return { __esModule: true, ...actual, runDeepScan: vi.fn(() => Promise.resolve([])) };
});

import { buildDeepScanDeps, nestedScrollables, startDeepScan, findLoadMoreButtons, waitForQuiet } from '@/extension/content/deepScanRunner';
import { runDeepScan, DEEP_SCAN_DEFAULTS } from '@/extension/shared/collection/deepScan';
import * as scanMem from '@/extension/shared/storage/per-host-scan-memory';
import * as loop from '@/extension/shared/collection/deepScan';

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

  it('exposes atBottom and now bindings that delegate to the scroller and the clock', () => {
    const { deps } = buildDeepScanDeps(() => {});
    // atBottom() runs the scroller's page-scroll math; now() reads the wall clock.
    expect(typeof deps.atBottom()).toBe('boolean');
    const before = Date.now();
    const t = deps.now();
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThanOrEqual(before);
  });

  it('resets the quiet window when the DOM mutates (real MutationObserver drives the callback)', async () => {
    const { deps } = buildDeepScanDeps(() => {});
    const ctrl = new AbortController();
    let settled = false;
    const p = deps.waitForQuiet(ctrl.signal, { quiet: 400, hardCap: 2000 }).then(() => { settled = true; });

    // A DOM mutation fires the observer callback, which clears and re-arms the
    // 400ms quiet timer — so the wait is still pending after only microtasks flush.
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 0)); // deliver the MutationRecords
    expect(settled).toBe(false);

    // The abort path resolves waitForQuiet immediately.
    ctrl.abort();
    await p;
    expect(settled).toBe(true);
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
    const observeSpy = vi.fn();
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
      void deps.waitForQuiet(ctrl.signal, { quiet: 400, hardCap: 2000 });
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

  it('waitForQuiet reports the elements that mutated during the wait', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '';
      const ac = new AbortController();
      const p = waitForQuiet(ac.signal, { quiet: 400, hardCap: 2000 });
      const added = document.createElement('div');
      added.innerHTML = '<img src="https://c/new.jpg">';
      document.body.appendChild(added); // childList mutation on body's subtree
      await vi.advanceTimersByTimeAsync(500); // past the 400ms quiet window
      const { roots } = await p;
      expect(Array.isArray(roots)).toBe(true);
      expect((roots as Element[]).some((el) => el === added || added.contains(el))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a settleMs spanning the wait-start to the last mutation', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '';
      const p = waitForQuiet(new AbortController().signal, { quiet: 400, hardCap: 4000 });
      await vi.advanceTimersByTimeAsync(100);
      const d = document.createElement('div');
      d.innerHTML = '<img src="https://c/n.jpg">';
      document.body.appendChild(d); // a mutation ~100ms into the wait
      await vi.advanceTimersByTimeAsync(500); // past the 400ms quiet window
      const { roots, settleMs } = await p;
      expect((roots as Element[]).length).toBeGreaterThan(0); // the added div is a mutated root
      expect(settleMs).toBeGreaterThanOrEqual(100);           // mutation landed ~100ms into the wait
      expect(settleMs).toBeLessThan(4000);                    // under the hard cap
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('startDeepScan config', () => {
  const mockRun = runDeepScan as Mock;
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
      '<a id="e" href="/next">Load more</a>' + // plain anchor would navigate → excluded
      '<a id="f" href="/next" role="button">Load more</a>'; // role=button anchor STILL navigates → excluded
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
    const clicks = vi.fn();
    document.getElementById('lm')!.addEventListener('click', clicks);
    buildDeepScanDeps(() => {}, { clickLoadMore: true }).deps.scrollStep(1);
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('does not click when the option is off (default)', () => {
    document.body.innerHTML = '<button id="lm">Load more</button>';
    const clicks = vi.fn();
    document.getElementById('lm')!.addEventListener('click', clicks);
    buildDeepScanDeps(() => {}).deps.scrollStep(1);
    expect(clicks).not.toHaveBeenCalled();
  });
});

describe('scrollStep scroll scaling', () => {
  it('scrollStep scrolls by multiplier × innerHeight', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const by = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    try {
      const { deps } = buildDeepScanDeps(() => {});
      deps.scrollStep(0.5);
      expect(by).toHaveBeenLastCalledWith(0, 400);
    } finally {
      by.mockRestore();
    }
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

describe('startDeepScan — learned-scan wiring', () => {
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.restoreAllMocks();
    // location.hostname → registrableDomain('www.example.com') === 'example.com'
    Object.defineProperty(window, 'location', { value: new URL('https://www.example.com/gallery'), writable: true });
    // Writes now go through chrome.runtime.sendMessage (#293 phase-2, NEW-1): reset
    // call history from prior tests (it's a plain vi.fn(), not a vi.spyOn(), so
    // vi.restoreAllMocks() above doesn't clear it) and give it a resolved promise
    // so the runner's `.catch()` on the fire-and-forget send is valid.
    (chrome.runtime.sendMessage as unknown as Mock).mockReset().mockResolvedValue(undefined);
  });

  it('reads memory, passes it as seed, and sends SAVE_SCAN_MEMORY with a fresh sample when the toggle is on', async () => {
    vi.spyOn(scanMem, 'loadScanMemoryForHost').mockResolvedValue({ settleMs: 700, scrolls: 15, updatedAt: 1 });
    const runSpy = vi.spyOn(loop, 'runDeepScan').mockImplementation(async (deps: unknown, opts: unknown) => {
      // Assert we got the seed, then fire onLearned like the real loop would.
      expect((opts as loop.DeepScanOpts).seed).toEqual({ settleMs: 700, scrolls: 15 });
      (deps as loop.DeepScanDeps).onLearned?.({ settleMs: 720, scrolls: 16, reason: 'complete' });
      return [];
    });

    await startDeepScan(vi.fn(), signal, { rememberScanBehaviour: true });

    expect(scanMem.loadScanMemoryForHost).toHaveBeenCalledWith('example.com');
    expect(runSpy).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SAVE_SCAN_MEMORY',
      host: 'example.com',
      sample: { settleMs: 720, scrolls: 16 },
    });
  });

  it('first visit (no prior memory): toggle on + reason complete still sends the bootstrap sample', async () => {
    const load = vi.spyOn(scanMem, 'loadScanMemoryForHost').mockResolvedValue(null);
    const runSpy = vi.spyOn(loop, 'runDeepScan').mockImplementation(async (deps: unknown, opts: unknown) => {
      // No prior memory → no seed is passed to runDeepScan.
      expect((opts as loop.DeepScanOpts).seed).toBeUndefined();
      (deps as loop.DeepScanDeps).onLearned?.({ settleMs: 450, scrolls: 8, reason: 'complete' });
      return [];
    });

    await startDeepScan(vi.fn(), signal, { rememberScanBehaviour: true });

    expect(load).toHaveBeenCalledWith('example.com');
    expect(runSpy).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SAVE_SCAN_MEMORY',
      host: 'example.com',
      sample: { settleMs: 450, scrolls: 8 },
    });
  });

  it('does NOT read or send when the toggle is off (behaviour-neutral)', async () => {
    const load = vi.spyOn(scanMem, 'loadScanMemoryForHost').mockResolvedValue({ settleMs: 700, scrolls: 15, updatedAt: 1 });
    const runSpy = vi.spyOn(loop, 'runDeepScan').mockImplementation(async (deps: unknown, opts: unknown) => {
      expect((opts as loop.DeepScanOpts).seed).toBeUndefined();
      (deps as loop.DeepScanDeps).onLearned?.({ settleMs: 720, scrolls: 16, reason: 'complete' });
      return [];
    });

    await startDeepScan(vi.fn(), signal, { rememberScanBehaviour: false });

    expect(load).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalled();
  });

  it('write rule: aborted/error do not send', async () => {
    vi.spyOn(scanMem, 'loadScanMemoryForHost').mockResolvedValue(null);
    vi.spyOn(loop, 'runDeepScan').mockImplementation(async (deps: unknown) => {
      (deps as loop.DeepScanDeps).onLearned?.({ settleMs: 100, scrolls: 3, reason: 'aborted' });
      return [];
    });
    await startDeepScan(vi.fn(), signal, { rememberScanBehaviour: true });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('write rule: a budget-truncated stop keeps the prior scroll depth', async () => {
    vi.spyOn(scanMem, 'loadScanMemoryForHost').mockResolvedValue({ settleMs: 500, scrolls: 30, updatedAt: 1 });
    vi.spyOn(loop, 'runDeepScan').mockImplementation(async (deps: unknown) => {
      // max-time truncates depth → scrolls this run (5) under-counts; keep prior 30.
      (deps as loop.DeepScanDeps).onLearned?.({ settleMs: 600, scrolls: 5, reason: 'max-time' });
      return [];
    });
    await startDeepScan(vi.fn(), signal, { rememberScanBehaviour: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SAVE_SCAN_MEMORY',
      host: 'example.com',
      sample: { settleMs: 600, scrolls: 30 },
    });
  });
});
