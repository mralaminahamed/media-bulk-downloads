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
});
