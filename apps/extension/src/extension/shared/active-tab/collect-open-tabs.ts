import { ImageInfo } from '@mbd/core/types';
import { dedupeByCanonical } from '@mbd/core/collection/multiTab';
import { mapWithConcurrency } from '@/extension/popup/utils';

/** Cap on concurrent per-tab GET_IMAGES sends, so scanning many tabs doesn't fan
 *  out into dozens of simultaneous collect runs. */
const TAB_SCAN_CONCURRENCY = 5;
/** Per-tab budget. An unresponsive tab (no live content script, not fully loaded,
 *  or a heavy page) is abandoned after this and counted as skipped, never stalling
 *  the batch. */
const TAB_SCAN_TIMEOUT_MS = 8000;

/** An open tab we can actually collect from: real tab id, loaded (not discarded),
 *  and an http(s) page (so restricted schemes — chrome://, chrome-extension://,
 *  file://, about:, view-source: — are excluded up front). */
function isEligibleTab(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number; url: string } {
  return typeof tab.id === 'number' && !tab.discarded && !!tab.url && /^https?:/i.test(tab.url);
}

/** A picker-friendly view of an eligible tab. */
export interface OpenTabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

/** Messages one tab's content script for its media, resolving null on any failure
 *  (no content script, runtime error, or timeout) so the caller can count it as
 *  skipped. Mirrors collect-active-tab's GET_IMAGES send, plus a timeout race. */
function sendGetImages(tabId: number): Promise<ImageInfo[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: ImageInfo[] | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), TAB_SCAN_TIMEOUT_MS);
    try {
      chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
        if (chrome.runtime.lastError) return finish(null);
        finish(Array.isArray(images) ? images : []);
      });
    } catch {
      finish(null);
    }
  });
}

/** Eligible tabs in the current window, for the "Selected tabs" picker. */
export async function listOpenTabs(): Promise<OpenTabInfo[]> {
  const all = await chrome.tabs.query({ currentWindow: true });
  return all.filter(isEligibleTab).map((t) => ({
    id: t.id,
    title: t.title?.trim() || t.url,
    url: t.url,
    favIconUrl: t.favIconUrl,
  }));
}

export interface MultiTabResult {
  items: ImageInfo[];
  /** Tabs that returned media successfully. */
  scanned: number;
  /** Tabs skipped: ineligible scheme/discarded, or failed/timed-out. */
  skipped: number;
}

/**
 * Collects media across the current window's open tabs (#283). With `tabIds`,
 * restricts to that subset (the "Selected tabs" scope); otherwise every eligible
 * tab ("All tabs"). Each tab is messaged with bounded concurrency and a per-tab
 * timeout; returned items are tagged with their source tab and the combined set is
 * de-duplicated by canonical identity (largest copy wins). Restricted/unresponsive
 * tabs are counted in `skipped`, never fatal.
 */
export async function collectOpenTabs(
  opts: { tabIds?: number[]; onProgress?: (done: number, total: number) => void } = {},
): Promise<MultiTabResult> {
  const all = await chrome.tabs.query({ currentWindow: true });
  const wanted = opts.tabIds ? all.filter((t) => typeof t.id === 'number' && opts.tabIds!.includes(t.id)) : all;
  const eligible = wanted.filter(isEligibleTab);
  const ineligible = wanted.length - eligible.length;

  const total = eligible.length;
  let done = 0;
  let failed = 0;

  const perTab = await mapWithConcurrency(eligible, TAB_SCAN_CONCURRENCY, async (tab) => {
    const images = await sendGetImages(tab.id);
    done++;
    opts.onProgress?.(done, total);
    if (!images) {
      failed++;
      return [] as ImageInfo[];
    }
    const sourcePage = { url: tab.url, title: tab.title };
    return images.map((im) => ({ ...im, sourcePage }));
  });

  return {
    items: dedupeByCanonical(perTab.flat()),
    scanned: total - failed,
    skipped: ineligible + failed,
  };
}
