import { buildDeepScanDeps } from '@/extension/content/deepScanRunner';

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
