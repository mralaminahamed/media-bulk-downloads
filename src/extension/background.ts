import {
  AddFavouriteMessage,
  ChromeMessage,
  DownloadMessage,
  DownloadResponse,
  HistoryEntry,
  ImageInfo,
  OpenDownloadMessage,
  OpenUrlMessage,
  RemoveFavouriteMessage,
  RemoveHistoryMessage,
  ResolveHint,
  ResolveOriginalsMessage,
  ResolveOriginalsResponse,
  SettingsData,
  ShowDownloadMessage,
  XMediaSeenMessage,
} from '@/types';
import { filterImagesBySettings } from './shared/filters';
import { DEFAULT_SETTINGS, withDefaults } from './shared/settings';
import {
  sanitizePathSegment,
  expandPathTemplate,
  hostFromUrl,
  registrableDomain,
  todayISO,
} from './shared/paths';
import { avExtensionForType, extensionFromUrl } from './shared/mediaType';
import { resolveOriginal, NetDeps } from './shared/resolvers/network';
import { mediaIdFromPoster, pinTwimgUrl } from './shared/x-media-sniff';
import { recordDownloads, removeEntry, clearHistory } from './shared/history';
import { addFavourite, removeFavourite, clearFavourites } from './shared/favourites';

export { DEFAULT_SETTINGS, sanitizePathSegment };

let currentSettings: SettingsData = { ...DEFAULT_SETTINGS };

const BADGE_COLOR = '#4F46E5';

// The service worker is ephemeral: a message can wake it and be handled before
// the async settings read completes. `settingsReady` resolves once settings have
// been read at least once, so a download that wakes the worker never runs against
// DEFAULT_SETTINGS (wrong subfolder/prefix/naming/filters).
let markSettingsLoaded: (() => void) | undefined;
const settingsReady: Promise<void> = new Promise((resolve) => {
  markSettingsLoaded = resolve;
});

/**
 * Load the current settings from storage.
 */
function loadSettings(): void {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = withDefaults(result.settings);
      applySettings();
    }
    // Resolve on the first read whether or not anything was stored — a first-run
    // user with no saved settings correctly keeps DEFAULT_SETTINGS.
    markSettingsLoaded?.();
    markSettingsLoaded = undefined;
  });
}

/**
 * Apply the current settings to all tabs.
 */
function applySettings(): void {
  if (!currentSettings.showImageCount) {
    clearAllBadges();
  } else {
    updateAllTabsBadges();
  }
  updateAllTabsActionMode();
}

/**
 * Whether the on-page bubble can be injected into a given URL. Content scripts
 * don't run on browser pages, the extension gallery, or the Chrome Web Store.
 */
export function isInjectableUrl(url: string | undefined): boolean {
  if (!url || !/^(https?|file):/i.test(url)) return false;
  if (/^https:\/\/chromewebstore\.google\.com/i.test(url)) return false;
  if (/^https:\/\/chrome\.google\.com\/webstore/i.test(url)) return false;
  if (/^https:\/\/addons\.mozilla\.org/i.test(url)) return false;
  return true;
}

/**
 * When the bubble is enabled on an injectable page, clear the toolbar popup so a
 * click toggles the on-page bubble instead. Everywhere else, keep the popup as a
 * fallback (it's the only surface that works on restricted pages).
 */
function updateTabActionMode(tabId: number, url: string | undefined): void {
  const useBubble = currentSettings.bubbleEnabled && isInjectableUrl(url);
  // WXT emits the popup as popup.html; restoring the toolbar popup must point at
  // that file (the old crxjs build used index.html).
  chrome.action.setPopup({ tabId, popup: useBubble ? '' : 'popup.html' });
}

function updateAllTabsActionMode(): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        updateTabActionMode(tab.id, tab.url);
      }
    });
  });
}

/**
 * Clear the badge text for all tabs.
 */
function clearAllBadges(): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    });
  });
}

/**
 * Update the badge text for all tabs.
 */
function updateAllTabsBadges(): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        updateTabBadge(tab.id);
      }
    });
  });
}

/**
 * Update the badge text for the given tab.
 */
function updateTabBadge(tabId: number): void {
  chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
    // Tabs without a content script (chrome://, the web store, etc.) surface a
    // lastError; ignore them.
    if (chrome.runtime.lastError) {
      return;
    }

    if (images) {
      const badgeText = filterImagesBySettings(images, currentSettings).length.toString();
      chrome.action.setBadgeText({ text: badgeText, tabId });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
    }
  });
}

/**
 * Maps a collected image type to a safe file extension.
 */
export function extensionForType(type: string): string {
  switch (type) {
    case 'jpeg':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
    case 'bmp':
    case 'ico':
      return type;
    default:
      return 'jpg';
  }
}


/**
 * Derives a safe base filename (no extension) from an image URL, or null when the
 * URL carries no usable name — data/blob URIs, or paths with no basename
 * (trailing slash / query-only). The caller appends the detected extension.
 */
export function originalNameFromUrl(url: string): string | null {
  if (/^(data|blob):/i.test(url)) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const last = pathname.split('/').pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* keep raw on malformed escapes */
  }

  // Strip a trailing extension only when the dot isn't the first char.
  const dot = decoded.lastIndexOf('.');
  const base = dot > 0 ? decoded.slice(0, dot) : decoded;

  const safe = sanitizePathSegment(base).split('/').pop() ?? '';
  return safe || null;
}

/**
 * Builds a safe, relative download path for an image. `settings.downloadPath`
 * is a template that may reference `{host}`, `{domain}`, `{date}`, and `{kind}`
 * tokens; `sourcePageUrl` supplies the site those tokens resolve against.
 */
export function buildDownloadFilename(
  image: ImageInfo,
  index: number,
  settings: SettingsData,
  sourcePageUrl?: string,
): string {
  const extension =
    image.kind === 'image'
      ? (image.ext || extensionForType(image.type))
      : (avExtensionForType(image.type)
          ?? extensionFromUrl(image.src)
          ?? (image.kind === 'video' ? 'mp4' : 'mp3'));
  const prefixed = `${sanitizePathSegment(settings.fileNamePrefix) || 'image_'}${index + 1}.${extension}`;

  let fileName: string;
  if (settings.namingMode === 'original') {
    const name = originalNameFromUrl(image.src);
    fileName = name ? `${name}.${extension}` : prefixed;
  } else {
    fileName = prefixed;
  }

  const host = hostFromUrl(sourcePageUrl);
  const dir = expandPathTemplate(settings.downloadPath, {
    host,
    domain: registrableDomain(host),
    date: todayISO(),
    kind: image.kind,
  });
  return dir ? `${dir}/${fileName}` : fileName;
}

/**
 * Downloads each eligible image and records the successful ones to history,
 * tagged with the source page they came from. Failures (a Chrome-reported
 * `lastError`, or no `downloadId`) are silently skipped — nothing is recorded
 * for them.
 */
/** Outcome of a download batch, used to report the real status to the popup. */
export interface DownloadResult {
  /** How many items were eligible after filtering. */
  total: number;
  /** How many downloads chrome actually started (returned a downloadId). */
  succeeded: number;
  /** How many failed to start (no id / runtime.lastError). */
  failed: number;
}

export async function downloadAndRecord(
  eligible: ImageInfo[],
  sourcePage: { url: string; title?: string } | undefined,
): Promise<DownloadResult> {
  const entries = await Promise.all(
    eligible.map(
      (image, index) =>
        new Promise<HistoryEntry | null>((resolve) => {
          const filename = buildDownloadFilename(image, index, currentSettings, sourcePage?.url);
          chrome.downloads.download(
            { url: image.src, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
            (downloadId) => {
              if (chrome.runtime.lastError || downloadId === undefined) {
                resolve(null);
                return;
              }
              resolve({
                src: image.src,
                filename: filename.split('/').pop() ?? filename,
                kind: image.kind,
                type: image.type,
                thumbnailSrc: image.thumbnailSrc ?? image.poster ?? image.src,
                sourcePageUrl: sourcePage?.url ?? '',
                sourcePageTitle: sourcePage?.title,
                time: Date.now(),
                downloadId,
              });
            },
          );
        }),
    ),
  );
  const recorded = entries.filter((e): e is HistoryEntry => e !== null);
  await recordDownloads(recorded);
  return { total: eligible.length, succeeded: recorded.length, failed: eligible.length - recorded.length };
}

/** `1 file` / `N files` — correct singular/plural for a count. */
function fileCount(n: number): string {
  return `${n} file${n === 1 ? '' : 's'}`;
}

/** Human-readable final status for a finished download batch. */
export function downloadStatusMessage(r: DownloadResult): string {
  if (r.total === 0) return 'No files to download.';
  if (r.succeeded === 0) return `Couldn't download ${fileCount(r.total)}.`;
  if (r.failed === 0) return `Downloaded ${fileCount(r.succeeded)}.`;
  return `Downloaded ${r.succeeded} of ${fileCount(r.total)} — ${r.failed} failed.`;
}

/**
 * Real mp4 URLs the page's own GraphQL responses exposed, per tab
 * (`mediaId -> mp4`). Filled passively by the MAIN-world sniffer (see
 * `x-media-sniffer.content.ts`), consumed sniffer-first when resolving Twitter
 * videos so age-restricted clips the user can see resolve without any forged
 * request. In-memory, bounded, dropped when the tab closes.
 */
const snifferByTab = new Map<number, Map<string, string>>();
const SNIFF_CAP_PER_TAB = 800;

/** Merge sniffed `[mediaId, mp4]` pairs for a tab; host-pin and cap defensively. */
export function storeSniffedMedia(tabId: number, pairs: unknown): void {
  if (!Array.isArray(pairs)) return;
  let map = snifferByTab.get(tabId);
  if (!map) {
    map = new Map();
    snifferByTab.set(tabId, map);
  }
  for (const pair of pairs) {
    if (!Array.isArray(pair)) continue;
    const [mid, url] = pair;
    const pinned = pinTwimgUrl(url);
    if (typeof mid === 'string' && pinned && map.size < SNIFF_CAP_PER_TAB) map.set(mid, pinned);
  }
}

/**
 * Resolves each hint to its final URL with bounded concurrency (limit 4).
 * Inline loop — the background service worker can't import the popup's
 * `mapWithConcurrency` helper. Failures are skipped (never throw).
 *
 * For Twitter videos, a real mp4 the page already exposed (`sniffed`, keyed by
 * the poster's media id) wins over a network fetch — it covers age-restricted
 * clips syndication tombstones and avoids a request entirely.
 */
export async function resolveOriginalsBatch(
  hints: { src: string; hint: ResolveHint }[],
  deps: NetDeps = { fetch: (...a) => fetch(...a) },
  sniffed?: Map<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const limit = 4;
  let i = 0;
  async function worker() {
    while (i < hints.length) {
      const { src, hint } = hints[i++];
      let url: string | null = null;
      if (hint.platform === 'twitter' && sniffed) {
        const mid = mediaIdFromPoster(src);
        if (mid) url = sniffed.get(mid) ?? null;
      }
      if (!url) url = await resolveOriginal(hint, deps);
      if (url) out[src] = url;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, hints.length) }, worker));
  return out;
}

chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
});

// Service workers are ephemeral; reload settings whenever the worker starts.
if (chrome.storage?.sync) {
  loadSettings();
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    currentSettings = withDefaults(changes.settings.newValue as Partial<SettingsData>);
    applySettings();
    // A change event also means settings are now known — resolve the gate so a
    // download isn't left waiting on the initial read.
    markSettingsLoaded?.();
    markSettingsLoaded = undefined;
  }
});

// Drop a tab's sniffed-media map when it closes (no persistence, no leak).
chrome.tabs.onRemoved.addListener((tabId) => {
  snifferByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (currentSettings.showImageCount) {
    updateTabBadge(activeInfo.tabId);
  }
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.id) return;
    updateTabActionMode(tab.id, tab.url);
  });
});

// When the bubble is enabled, the popup is cleared for injectable tabs, so a
// toolbar click lands here instead of opening the popup — toggle the bubble.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, 'TOGGLE_BUBBLE', () => void chrome.runtime.lastError);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateTabActionMode(tabId, tab.url);
  }

  if (!currentSettings.showImageCount) {
    return;
  }

  if (changeInfo.status === 'complete' && tab.url) {
    updateTabBadge(tabId);
  } else if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '...', tabId });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: DownloadResponse | ResolveOriginalsResponse) => void,
  ) => {
    if (typeof message === 'object' && message.type === 'X_MEDIA_SEEN') {
      // Passive sniffer feed from the x.com content script (per tab). Fire-and-forget.
      if (sender.tab?.id != null) storeSniffedMedia(sender.tab.id, (message as XMediaSeenMessage).pairs);
      return; // no response
    }

    if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
      const { images, sourcePage } = message as DownloadMessage;
      // Wait for settings so the filter and the built filenames use the user's
      // real settings, not defaults, when this message woke the worker. Report
      // the status only after the downloads are dispatched, so the popup shows
      // the real outcome (how many started / failed) rather than a premature,
      // never-updated "Downloading…".
      void settingsReady.then(async () => {
        const eligible = filterImagesBySettings(images, currentSettings);
        const result = await downloadAndRecord(eligible, sourcePage);
        sendResponse({
          status: result.failed > 0 && result.succeeded === 0 ? 'error' : 'success',
          message: downloadStatusMessage(result),
        });
      });
      return true; // response is sent asynchronously after the downloads dispatch
    }

    if (typeof message === 'object' && message.type === 'OPEN_DOWNLOAD_FILE') {
      // Content scripts (the bubble) can't call chrome.downloads; routing both
      // popup and bubble through here keeps one code path. open() takes no
      // callback, so a stale/removed id surfaces only as an async
      // runtime.lastError (harmless console noise), not a throw.
      chrome.downloads.open((message as OpenDownloadMessage).downloadId);
      return; // fire-and-forget
    }

    if (typeof message === 'object' && message.type === 'SHOW_DOWNLOAD') {
      chrome.downloads.show((message as ShowDownloadMessage).downloadId);
      return;
    }

    if (typeof message === 'object' && message.type === 'OPEN_URL') {
      // The URL is page-derived (a media/source URL from history); only ever open
      // real web pages, never javascript:/data:/file: schemes.
      const { url } = message as OpenUrlMessage;
      if (/^https?:\/\//i.test(url)) void chrome.tabs.create({ url });
      return;
    }

    // History mutations are routed here so every write (downloads + user edits)
    // happens in the background realm and serializes through one write chain.
    if (typeof message === 'object' && message.type === 'CLEAR_HISTORY') {
      void clearHistory();
      return;
    }

    if (typeof message === 'object' && message.type === 'REMOVE_HISTORY_ENTRY') {
      void removeEntry((message as RemoveHistoryMessage).src);
      return;
    }

    // Favourite mutations are routed here too — same single-writer rationale.
    if (typeof message === 'object' && message.type === 'ADD_FAVOURITE') {
      void addFavourite((message as AddFavouriteMessage).entry);
      return;
    }

    if (typeof message === 'object' && message.type === 'REMOVE_FAVOURITE') {
      void removeFavourite((message as RemoveFavouriteMessage).src);
      return;
    }

    if (typeof message === 'object' && message.type === 'CLEAR_FAVOURITES') {
      void clearFavourites();
      return;
    }

    if (typeof message === 'object' && message.type === 'RESOLVE_ORIGINALS') {
      // Dedup hints by src before resolving.
      const seen = new Set<string>();
      const hints = (message as ResolveOriginalsMessage).hints.filter((h) => {
        if (seen.has(h.src)) return false;
        seen.add(h.src);
        return true;
      });
      // Resolve against the source tab's sniffed mp4 map first. The tab is the
      // message sender (bubble/content); for a popup request there is no sender
      // tab, so fall back to the active tab.
      const run = (tabId?: number) => {
        const sniffed = tabId != null ? snifferByTab.get(tabId) : undefined;
        resolveOriginalsBatch(hints, undefined, sniffed).then((resolved) => sendResponse({ resolved }));
      };
      if (sender.tab?.id != null) run(sender.tab.id);
      else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => run(tabs[0]?.id));
      return true; // async
    }

    // Unmatched messages (e.g. the content script's DEEP_SCAN_PROGRESS broadcast)
    // get no response — return false so the message channel closes immediately
    // instead of leaking an open port.
    return false;
  },
);

export { updateTabBadge, loadSettings };
