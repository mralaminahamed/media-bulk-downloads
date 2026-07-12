import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/extension/popup/App';
import { ImageInfo } from '@/types';
import { deepScanActiveTab } from '@/extension/shared/active-tab/deep-scan-active-tab';
import { requestResolveOriginals } from '@/extension/shared/active-tab/resolve-originals-active';
import { getPageType } from '@/extension/shared/active-tab/collect-active-tab';
import { excludedMatchers, EXCLUDED_KEY } from '@/extension/shared/storage/excluded';
import { SrcKeySet } from '@/extension/shared/collection/canonical';
import { HISTORY_KEY } from '@/extension/shared/storage/history';
import { FAVOURITES_KEY } from '@/extension/shared/storage/favourites';
import { buildZip } from '@/extension/shared/download/zip';
import { convertImage } from '@/extension/shared/download/convert/convert';

vi.mock('@/extension/shared/active-tab/deep-scan-active-tab', () => ({
  deepScanActiveTab: vi.fn(async (onProgress) => {
    onProgress({ type: 'DEEP_SCAN_PROGRESS', found: 2, scrolls: 1, elapsedMs: 100 });
    return [
      { src: 'https://cdn.com/a.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
      { src: 'https://cdn.com/deep.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
    ];
  }),
  abortDeepScanActiveTab: vi.fn(),
}));

vi.mock('@/extension/shared/active-tab/resolve-originals-active', () => ({
  requestResolveOriginals: vi.fn(async () => ({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } })),
}));

// App's default `collect` prop is `collectFromActiveTab` from this module, but every
// test below passes its own `collect` prop, so that export is never actually invoked.
// `getPageType` IS exercised for real (via useMediaEngine's smartPageDefaults gate),
// so it's mocked here per-test below to control the classified PageType.
vi.mock('@/extension/shared/active-tab/collect-active-tab', () => ({
  collectFromActiveTab: vi.fn(),
  getPageType: vi.fn(async () => 'unknown'),
}));

vi.mock('@/extension/shared/storage/excluded', async () => {
  // urls must be a real SrcKeySet — the optimistic exclude path calls withAdded().
  const { SrcKeySet: KeySet } = await vi.importActual<typeof import('@/extension/shared/collection/canonical')>('@/extension/shared/collection/canonical');
  return {
    excludedMatchers: vi.fn(async () => ({ urls: new KeySet(), hosts: new Set() })),
    // ExcludedPanel (opened from the header) loads the raw list; keep it empty.
    loadExcluded: vi.fn(async () => []),
    EXCLUDED_KEY: 'excluded',
  };
});

// ZIP is built in the popup context — mock so tests drive the ok/partial/total-fail
// branches without hitting the network. zipFileName is deterministic here.
vi.mock('@/extension/shared/download/zip', () => ({
  buildZip: vi.fn(),
  zipFileName: vi.fn(() => 'example.com-media-2026-07-07.zip'),
}));

// Keep the real isConvertible (a pure classifier the download path branches on) so
// the passthrough/convert split is exercised for real; only the canvas-backed
// convertImage (unavailable under jsdom) is mocked.
vi.mock('@/extension/shared/download/convert/convert', async () => ({
  ...(await vi.importActual<typeof import('@/extension/shared/download/convert/convert')>('@/extension/shared/download/convert/convert')),
  convertImage: vi.fn(),
}));

const image = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'test.jpg', alt: 'Test', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false, kind: 'image', ...over,
});

const pendingVideo = image({
  src: 'poster.jpg', kind: 'video', type: 'mp4', poster: 'poster.jpg',
  unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '123' },
});

describe('App Component', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    (chrome.storage.sync.set as Mock).mockClear();
    (chrome.runtime.sendMessage as Mock).mockReset();
    (buildZip as Mock).mockReset();
    (convertImage as Mock).mockReset();
    global.fetch = vi.fn().mockRejectedValue(new Error('no')) as unknown as typeof fetch;
  });

  it('renders the brand header', async () => {
    render(<App collect={async () => []} />);
    expect(screen.getByText('Media Bulk Downloads')).toBeInTheDocument();
    // Let the async mount (collect + settings/favourites/excluded loads) settle
    // inside act so its state updates don't leak past the test.
    await screen.findByText('No media here');
  });

  it('shows the scanning state initially', async () => {
    render(<App collect={() => new Promise(() => {})} />);
    expect(screen.getByText('scanning this page')).toBeInTheDocument();
    // collect never resolves, but the storage loads do — flush them inside act.
    await act(async () => {});
  });

  it('shows filters and a download button once images load', async () => {
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('first scan filters by the settings loaded on mount (#293 refactor keeps this)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_k: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: { minimumImageSize: 500 } }),
    );
    const collect = async () => [
      image({ src: 'https://e.com/big.jpg', width: 800, height: 800 }),
      image({ src: 'https://e.com/tiny.jpg', width: 10, height: 10 }),
    ];
    render(<App collect={collect} />);
    await screen.findByText('Filters');
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download 2/i })).toBeNull();
  });

  it('shows the empty state when no images are found', async () => {
    render(<App collect={async () => []} />);
    expect(await screen.findByText('No media here')).toBeInTheDocument();
  });

  it('surfaces a collection error as a distinct error state', async () => {
    render(<App collect={async () => { throw new Error('content script missing'); }} />);
    expect(await screen.findByText(/can't read this page/i)).toBeInTheDocument();
    expect(screen.getByText('content script missing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('keeps the active toolbar filter when a deep scan repopulates the grid', async () => {
    const initial = [
      image({ src: 'https://c/photo.jpg', kind: 'image', type: 'jpeg' }),
      image({ src: 'https://c/clip.mp4', kind: 'video', type: 'mp4' }),
    ];
    render(<App collect={async () => initial} />);
    await screen.findByText('Filters');

    // Filter to Video only → just the clip shows.
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();

    // Deep scan adds image-kind items; the filter must still hold (not repopulate).
    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument(),
    );
  });

  it('sends a bulk download request and reflects the response', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) =>
      cb({ status: 'success', message: 'Downloaded 2 files.' }),
    );
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /download 2/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
        expect.any(Function),
      ),
    );
    expect(await screen.findByText('Downloaded 2 files.')).toBeInTheDocument();
  });

  it('selects one item and downloads only the selection', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) =>
      cb({ status: 'success', message: 'Downloaded 1 file.' }),
    );
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    // Before selecting: the plain bulk button downloads everything.
    expect(screen.getByRole('button', { name: /download 2/i })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);

    // Footer swaps to the selective action.
    await userEvent.click(await screen.findByRole('button', { name: /download selected 1/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES', images: [expect.objectContaining({ src: 'a.jpg' })] }),
        expect.any(Function),
      ),
    );
  });

  it('select-all ticks every shown item and Clear resets to bulk', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getByRole('checkbox', { name: /select all shown/i }));

    expect(await screen.findByRole('button', { name: /download selected 2/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));

    expect(screen.getByRole('button', { name: /download 2/i })).toBeInTheDocument();
  });

  it('offers no selection checkbox for a pending video (nothing downloadable)', async () => {
    render(<App collect={async () => [pendingVideo]} />);
    await screen.findByText('Filters');

    expect(screen.queryByRole('checkbox', { name: /select item/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /select all shown/i })).toBeNull();
  });

  it('offers no selection checkbox for a pending image (nothing downloadable)', async () => {
    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image',
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [pendingImage]} />);
    await screen.findByText('Filters');

    expect(screen.queryByRole('checkbox', { name: /select item/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /select all shown/i })).toBeNull();
  });

  it('disables download when a type filter matches nothing', async () => {
    render(<App collect={async () => [image({ type: 'png' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'jpeg' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^download$/i })).toBeDisabled(),
    );
  });

  it('lazily enriches remote image sizes after load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      headers: { get: () => '2048' },
    }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'remote.jpg', fileSize: 0 })]} />);
    await screen.findByText('Filters');

    // Card meta shows the enriched size.
    expect(await screen.findByText('2 KB')).toBeInTheDocument();
  });

  it('never fetches a pending image\'s placeholder src during size enrichment', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ headers: { get: () => '2048' } });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image', fileSize: 0,
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [image({ src: 'remote.jpg', fileSize: 0 }), pendingImage]} />);
    await screen.findByText('Filters');

    // The real image's size is enriched…
    expect(await screen.findByText('2 KB')).toBeInTheDocument();
    // …but the placeholder x.com URL is never HEAD/GET-requested (opt-in/passive
    // collection constraint — it's a tweet-page URL, not a real file).
    const fetchedUrls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(fetchedUrls).not.toContain(pendingImage.src);
  });

  it('reports a download error from the background', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = { message: 'boom' };
      cb(undefined);
      (chrome.runtime as { lastError?: unknown }).lastError = undefined;
    });
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /download 1/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/error: boom/i));
  });

  it('persists settings changes to storage', async () => {
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Display/i })); // showImageCount now lives on the Display tab
    fireEvent.click(screen.getByRole('switch', { name: /show image count/i }));
    fireEvent.click(screen.getByText('Save'));

    // Settings persist through the background's single serialized writer.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_SETTINGS', patch: expect.objectContaining({ showImageCount: false }) }),
    );
  });

  it('persists the Bubble corner + Panel position dropdowns, keeping the drag-only offsets', async () => {
    // Stored state carries a dragged button offset (x/y) and a freeform panel
    // point — neither has a Settings control, so both must survive a form save.
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubblePosition: { corner: 'bottom-right', x: 99, y: 88 }, bubblePanelPoint: { x: 77, y: 66 } } }));
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Display/i })); // bubble controls now live on the Display tab
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i })); // reveals the bubble controls
    fireEvent.change(screen.getByLabelText('Bubble corner:'), { target: { value: 'top-left' } });
    fireEvent.change(screen.getByLabelText('Panel position:'), { target: { value: 'center' } });
    fireEvent.click(screen.getByText('Save'));

    // The popup sends a patch with the form-owned fields but WITHOUT the drag-only
    // ones (bubblePosition.x/y, bubblePanelPoint) — the background's serialized
    // merge preserves those from storage, so a concurrent bubble drag isn't lost.
    const call = (chrome.runtime.sendMessage as Mock).mock.calls.find((c) => c[0]?.type === 'SET_SETTINGS');
    expect(call?.[0].patch).toEqual(expect.objectContaining({
      bubbleEnabled: true,
      bubblePosition: { corner: 'top-left' },
      bubblePanelPlacement: 'center',
    }));
    expect(call?.[0].patch.bubblePosition).not.toHaveProperty('x');
    expect(call?.[0].patch).not.toHaveProperty('bubblePanelPoint');
  });

  it('does not clobber a bubble resize made while the popup is open', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubbleEnabled: true, bubbleWidth: 440, bubbleHeight: 560 } }));
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    // The on-page bubble is resized elsewhere → storage.sync 'settings' changes.
    // Fire the change on every listener this mount registered; only the popup's
    // sync listener reacts (the local-key listeners ignore area 'sync').
    const mountListeners = addListener.mock.calls.slice(before).map((c) => c[0]);
    await act(async () => {
      mountListeners.forEach((fn) =>
        fn({ settings: { newValue: { bubbleEnabled: true, bubbleWidth: 600, bubbleHeight: 700 } } }, 'sync'));
    });

    // Saving an unrelated Setting must carry the fresh 600/700, not the stale snapshot.
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Display/i })); // showImageCount now lives on the Display tab
    fireEvent.click(screen.getByRole('switch', { name: /show image count/i }));
    fireEvent.click(screen.getByText('Save'));
    const call = (chrome.runtime.sendMessage as Mock).mock.calls.find((c) => c[0]?.type === 'SET_SETTINGS');
    expect(call?.[0].patch).toEqual(expect.objectContaining({ bubbleWidth: 600, bubbleHeight: 700 }));
  });

  it('runs deep scan and merges new media into the list', async () => {
    const { container } = render(<App collect={async () => [image({ src: 'https://cdn.com/a.jpg' })]} />);
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));

    await waitFor(() => expect(headerCount()).toBe('2'));
    expect(deepScanActiveTab).toHaveBeenCalled();
  });

  it('does not lose settings-filtered images from the raw set during a deep scan', async () => {
    const { container } = render(
      <App
        collect={async () => [
          image({ src: 'small.jpg', width: 50, height: 50 }),
          image({ src: 'big.jpg', width: 300, height: 300 }),
        ]}
      />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    // Both images are eligible under the default (0) minimum size.
    await waitFor(() => expect(headerCount()).toBe('2'));

    // Raise the minimum size via Settings so the small image is excluded from
    // the visible/eligible list, even though it's still collected.
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i })); // minimumImageSize now lives on the Media tab
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(headerCount()).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));
    // Deep scan mock adds two new items, both with unknown (0x0) dimensions,
    // which always pass the size filter regardless of minimumImageSize.
    await waitFor(() => expect(headerCount()).toBe('3'));

    // Relax the settings again so the previously-filtered small image should
    // reappear — this only happens if it survived in rawImagesRef.current
    // through the deep-scan merge instead of being silently dropped.
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i }));
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(headerCount()).toBe('4'));
  });

  it('live re-filters the grid when Exclude emoji is toggled on', async () => {
    // Regression: the settings-change effect's dependency array omitted
    // settings.excludeEmoji, so toggling this setting alone (without a
    // re-scan) left the emoji tile stuck in the grid.
    const emojiItem = image({
      src: 'https://abs.twimg.com/emoji/v2/svg/1f9f8.svg', type: 'svg', kind: 'image',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    });
    const { container } = render(
      <App collect={async () => [emojiItem, image({ src: 'https://c/photo.jpg' })]} />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    // Both items are eligible before the setting is enabled.
    await waitFor(() => expect(headerCount()).toBe('2'));

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i })); // excludeEmoji now lives on the Media tab
    fireEvent.click(screen.getByRole('switch', { name: /exclude emoji/i }));
    fireEvent.click(screen.getByText('Save'));

    // The emoji tile drops out immediately — no re-scan required.
    await waitFor(() => expect(headerCount()).toBe('1'));
  });

  it('live-removes excluded sources from the grid on a storage change', async () => {
    const matchersMock = excludedMatchers as Mock;
    matchersMock.mockResolvedValueOnce({ urls: new SrcKeySet(), hosts: new Set() }); // initial load: nothing excluded yet

    const { container } = render(
      <App
        collect={async () => [
          image({ src: 'https://cdn.ads.com/a.png' }),
          image({ src: 'https://keep.com/b.png' }),
        ]}
      />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    // Both items are eligible before anything is excluded.
    await waitFor(() => expect(headerCount()).toBe('2'));

    // Next call to excludedMatchers() (triggered by the storage change below)
    // returns a host match for the ads.com site (registrable-domain scoped).
    matchersMock.mockResolvedValueOnce({ urls: new SrcKeySet(), hosts: new Set(['ads.com']) });

    // App registers its excluded-storage listener last (after history and
    // favourites) on every mount, so the most recently recorded addListener
    // call is this render's — pick that one rather than every accumulated
    // call across the whole suite (which would re-consume the queued
    // mockResolvedValueOnce on a stale, already-unmounted listener).
    const addListenerMock = chrome.storage.onChanged.addListener as Mock;
    const excludedListener = addListenerMock.mock.calls[addListenerMock.mock.calls.length - 1][0];
    await act(async () => {
      excludedListener({ [EXCLUDED_KEY]: { newValue: [] } }, 'local');
      await Promise.resolve();
      await Promise.resolve();
    });

    // The excluded host's item drops out immediately — no re-scan required.
    await waitFor(() => expect(headerCount()).toBe('1'));
  });

  it('shows a pending Twitter video (but never resolves it) when resolveOriginals is off', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: false } }));

    const { container } = render(
      <App
        collect={async () => [
          image({ src: 'poster.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' } }),
          image({ src: 'normal.jpg' }),
        ]}
      />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    // Both items are on the page — the pending video is shown, just not resolved.
    await waitFor(() => expect(headerCount()).toBe('2'));
    expect(requestResolveOriginals).not.toHaveBeenCalled();
    // Only the normal image counts toward the downloadable total.
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('"Get all videos" resolves every pending video in one batch and makes them downloadable', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: false } }));
    const resolveMock = requestResolveOriginals as Mock;
    resolveMock.mockClear(); // shared across tests; reset call count without touching the default impl
    resolveMock.mockResolvedValueOnce({
      'poster1.jpg': { url: 'https://video.twimg.com/a.mp4' },
      'poster2.jpg': { url: 'https://video.twimg.com/b.mp4' },
    });

    render(
      <App
        collect={async () => [
          image({ src: 'poster1.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' } }),
          image({ src: 'poster2.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '2' } }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    // Setting is off, so nothing auto-resolves; the bulk button shows the count.
    const btn = await screen.findByRole('button', { name: /get all videos \(2\)/i });
    expect(requestResolveOriginals).not.toHaveBeenCalled();

    fireEvent.click(btn);

    // One batched request carrying both targets.
    await waitFor(() => expect(resolveMock).toHaveBeenCalledTimes(1));
    expect(resolveMock).toHaveBeenCalledWith([
      { src: 'poster1.jpg', hint: { platform: 'twitter', id: '1' } },
      { src: 'poster2.jpg', hint: { platform: 'twitter', id: '2' } },
    ]);

    // Both resolve to real mp4s → downloadable → "Download 2".
    await waitFor(() => expect(screen.getByRole('button', { name: /download 2/i })).toBeInTheDocument());
    // And the bulk button is gone (no pending videos left).
    expect(screen.queryByRole('button', { name: /get all videos/i })).not.toBeInTheDocument();
  });

  it('includes the source page in the download message', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ url: 'https://page', title: 'Pg' }]);
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) =>
      cb({ status: 'success', message: 'Downloaded 1 file.' }),
    );
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /download 1/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOWNLOAD_IMAGES',
          sourcePage: expect.objectContaining({ url: 'https://page' }),
        }),
        expect.any(Function),
      ),
    );
  });

  it('resolves and updates src when resolveOriginals is on', async () => {
    // Settings load from chrome.storage asynchronously relative to the very
    // first scan (which always fires with the component's initial settings),
    // so the setting only takes effect starting with the next scan — trigger
    // a rescan (as a real user would after changing this option) to exercise
    // the gate with the loaded `resolveOriginals: true`.
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: true } }));

    const { container } = render(
      <App
        collect={async () => [
          image({ src: 'poster.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' } }),
        ]}
      />,
    );
    await waitFor(() => expect(screen.getByTitle('Rescan page')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Rescan page'));

    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    await waitFor(() => expect(requestResolveOriginals).toHaveBeenCalled());
    // The item survives (still 1) once resolved, rather than being dropped.
    await waitFor(() => expect(headerCount()).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video?.getAttribute('src')).toBe('https://video.twimg.com/hi.mp4');
    });
  });

  it('a video that fails to resolve stays visible as a pending poster and does not wipe the other items', async () => {
    // Regression: a pending video must not flicker in and then be dropped when
    // resolution returns nothing — it stays shown (as a pending poster, still
    // excluded from downloads), leaving the rest of the grid intact.
    const resolveMock = requestResolveOriginals as Mock;
    resolveMock.mockResolvedValue({}); // nothing resolves for this test
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: true } }));

    const { container } = render(
      <App
        collect={async () => [
          image({ src: 'https://c/a.jpg', kind: 'image' }),
          image({ src: 'poster.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' } }),
        ]}
      />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    await waitFor(() => expect(resolveMock).toHaveBeenCalled());
    // Both items show — the pending video is never dropped, just not downloadable.
    await waitFor(() => expect(headerCount()).toBe('2'));
    await new Promise((r) => setTimeout(r, 30)); // let any late setState land
    expect(headerCount()).toBe('2'); // no override / drop
    expect(container.querySelector('video')).toBeNull(); // no preview modal opened
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();

    resolveMock.mockResolvedValue({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } }); // restore default
  });

  it('shows a pending video but excludes it from the download count', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), pendingVideo]} />);
    await screen.findByText('Filters');
    // both items are on the page (image + pending video) → plural header…
    expect(screen.getByText('items on this page')).toBeInTheDocument();
    // …but only the real image is downloadable
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('shows a pending image but excludes it from the download count', async () => {
    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image',
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), pendingImage]} />);
    await screen.findByText('Filters');
    // both items are on the page (image + pending image) → plural header…
    expect(screen.getByText('items on this page')).toBeInTheDocument();
    // …but only the real image is downloadable
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('opens and closes the Favourites panel from the header', async () => {
    render(<App collect={async () => []} />);
    await userEvent.click(await screen.findByRole('button', { name: /favourites/i }));
    expect(await screen.findByText('Saved media')).toBeInTheDocument();
    // Escape closes the panel (invoking the onClose that flips showFavourites off).
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Saved media')).toBeNull());
  });

  it('fetches a single video on demand even when resolveOriginals is off', async () => {
    (requestResolveOriginals as Mock).mockResolvedValueOnce({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } });
    render(<App collect={async () => [pendingVideo]} />);
    fireEvent.click(await screen.findByTitle('Get video'));
    await waitFor(() =>
      expect(requestResolveOriginals).toHaveBeenCalledWith([{ src: 'poster.jpg', hint: { platform: 'twitter', id: '123' } }]),
    );
    // once resolved it becomes downloadable
    expect(await screen.findByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('marks a video failed when resolution returns nothing', async () => {
    (requestResolveOriginals as Mock).mockResolvedValueOnce({});
    render(<App collect={async () => [pendingVideo]} />);
    fireEvent.click(await screen.findByTitle('Get video'));
    expect(await screen.findByText(/couldn't fetch/i)).toBeInTheDocument();
  });

  it('captures an HLS stream via the background and shows the returned status', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { captureHlsStreams: true } }));
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'CAPTURE_STREAM' && cb) cb({ status: 'Captured clip.mp4 — 8 segments (video + audio).' });
    });

    const hlsItem = image({
      src: 'https://x/master.m3u8', hlsManifest: 'https://x/master.m3u8', type: 'm3u8', kind: 'video',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    });
    render(<App collect={async () => [hlsItem]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByTitle('Capture stream'));

    expect(await screen.findByText(/Captured clip\.mp4 — 8 segments/)).toBeInTheDocument();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAPTURE_STREAM' }), expect.any(Function),
    );
  });

  it('keeps a per-item-fetched video downloadable after a settings change re-filters the grid', async () => {
    // Regression: handleFetchVideo used to swap the resolved item into
    // state.images/filteredImages only, leaving rawImagesRef.current still
    // holding the old pending (unresolvedVideo) entry. The settings-change
    // effect re-derives the grid from rawImagesRef, so changing a setting
    // (e.g. minimumImageSize) would revert the just-resolved video back to a
    // pending tile. handleFetchVideo now mirrors the swap into rawImagesRef
    // too, so the upgrade survives the re-filter below.
    (requestResolveOriginals as Mock).mockResolvedValueOnce({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } });
    render(<App collect={async () => [pendingVideo]} />);

    fireEvent.click(await screen.findByTitle('Get video'));
    await waitFor(() =>
      expect(requestResolveOriginals).toHaveBeenCalledWith([{ src: 'poster.jpg', hint: { platform: 'twitter', id: '123' } }]),
    );
    // Resolved → downloadable.
    expect(await screen.findByRole('button', { name: /download 1/i })).toBeInTheDocument();

    // Trigger the settings-change effect, which re-derives the grid from
    // rawImagesRef.current (keyed on minimumImageSize/excludeBase64Images/resolveOriginals).
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i })); // minimumImageSize now lives on the Media tab
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Save'));

    // Still downloadable — the resolved video was not reverted to pending.
    expect(await screen.findByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('per-item "Exclude this image" dispatches ADD_EXCLUDED with kind url', async () => {
    render(<App collect={async () => [image({ src: 'https://cdn.ads.com/a.png' })]} />);
    await screen.findByText('Filters');

    // open the target item's preview modal first (the exclude control now lives there)
    const detailButtons = await screen.findAllByRole('button', { name: 'View Details' });
    await userEvent.click(detailButtons[0]); // the sole/target seeded item
    await userEvent.click(screen.getByTitle('Exclude source'));
    await userEvent.click(await screen.findByText('Exclude this image'));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_EXCLUDED',
        entry: expect.objectContaining({ value: 'https://cdn.ads.com/a.png', kind: 'url', time: expect.any(Number) }),
      }),
    );
    // Excluding the shown image closes the preview (deterministic) rather than
    // silently reindexing it to a neighbour — the exclude control lived only in
    // the modal, so its disappearance proves the modal closed.
    await waitFor(() => expect(screen.queryByTitle('Exclude source')).toBeNull());
  });

  it('per-item "Exclude site …" dispatches ADD_EXCLUDED with kind host and the registrable domain', async () => {
    render(<App collect={async () => [image({ src: 'https://cdn.ads.com/a.png' })]} />);
    await screen.findByText('Filters');

    // open the target item's preview modal first (the exclude control now lives there)
    const detailButtons = await screen.findAllByRole('button', { name: 'View Details' });
    await userEvent.click(detailButtons[0]); // the sole/target seeded item
    await userEvent.click(screen.getByTitle('Exclude source'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /exclude site/i }));

    // Host exclusions are scoped to the registrable domain (cdn.ads.com -> ads.com)
    // so they cover sibling subdomains / rotating CDN edges.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_EXCLUDED',
        entry: expect.objectContaining({ value: 'ads.com', kind: 'host', time: expect.any(Number) }),
      }),
    );
  });

  it('exposes the exclude control only in the preview modal, not the grid hover', async () => {
    render(<App collect={async () => [image({ src: 'https://cdn.ads.com/a.png' })]} />);
    // enable capture-independent render; wait for the grid
    await screen.findAllByRole('button', { name: 'View Details' });
    expect(screen.queryByTitle('Exclude source')).toBeNull(); // not in the hover overlay
    await userEvent.click((await screen.findAllByRole('button', { name: 'View Details' }))[0]);
    expect(screen.getByTitle('Exclude source')).toBeInTheDocument(); // in the modal
  });

  it('bulk Exclude dispatches an ADD_EXCLUDED per selected item', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getByRole('checkbox', { name: /select all shown/i }));
    await userEvent.click(await screen.findByRole('button', { name: /more download options/i }));
    await userEvent.click(await screen.findByText('Exclude'));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_EXCLUDED',
        entry: expect.objectContaining({ value: 'a.jpg', kind: 'url', time: expect.any(Number) }),
      }),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_EXCLUDED',
        entry: expect.objectContaining({ value: 'b.jpg', kind: 'url', time: expect.any(Number) }),
      }),
    );
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter((c) => c[0]?.type === 'ADD_EXCLUDED'),
    ).toHaveLength(2);
  });

  // ── Convert-on-download ────────────────────────────────────────────────────
  it('converts raster images to PNG and passes svg/video through untouched', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { convertImagesTo: 'png' } }));
    (convertImage as Mock).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), ext: 'png', mime: 'image/png' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => { if (cb) cb({ status: 'success', message: 'ok' }); });

    render(
      <App
        collect={async () => [
          image({ src: 'photo.jpg', type: 'jpeg', kind: 'image' }),
          image({ src: 'icon.svg', type: 'svg', kind: 'image' }),
          image({ src: 'clip.mp4', type: 'mp4', kind: 'video' }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 3/i }));

    // The convertible jpeg is re-encoded and saved as bytes (PNG mime).
    await waitFor(() => expect(convertImage).toHaveBeenCalled());
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_BYTES', mime: 'image/png' }),
    );
    // The svg (vector) and the video (non-raster) are downloaded in original form.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DOWNLOAD_IMAGES',
        images: expect.arrayContaining([
          expect.objectContaining({ src: 'icon.svg' }),
          expect.objectContaining({ src: 'clip.mp4' }),
        ]),
      }),
    );
    expect(await screen.findByText('Converted 1 image to PNG.')).toBeInTheDocument();
  });

  it('converts to JPEG when the target format is jpeg', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { convertImagesTo: 'jpeg' } }));
    (convertImage as Mock).mockResolvedValue({ bytes: new Uint8Array([9]), ext: 'jpg', mime: 'image/jpeg' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'shot.png', type: 'png', kind: 'image' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 1/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_BYTES', mime: 'image/jpeg' }),
      ),
    );
    expect(await screen.findByText('Converted 1 image to JPEG.')).toBeInTheDocument();
  });

  it('falls back to the original file when a per-item convert fails', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { convertImagesTo: 'png' } }));
    (convertImage as Mock).mockResolvedValue(null); // decode/encode failure
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'broken.jpg', type: 'jpeg', kind: 'image' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 1/i }));

    // The item that couldn't convert is downloaded in its original form…
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOWNLOAD_IMAGES',
          images: expect.arrayContaining([expect.objectContaining({ src: 'broken.jpg' })]),
        }),
      ),
    );
    // …and no DOWNLOAD_BYTES was ever sent for it.
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter((c) => c[0]?.type === 'DOWNLOAD_BYTES'),
    ).toHaveLength(0);
    expect(await screen.findByText(/couldn't convert/i)).toBeInTheDocument();
  });

  // ── ZIP download ───────────────────────────────────────────────────────────
  const openMenuAndChoose = async (menuItem: RegExp): Promise<void> => {
    await userEvent.click(await screen.findByRole('button', { name: /more download options/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: menuItem }));
  };

  it('zips everything and dispatches DOWNLOAD_ZIP when every fetch succeeds', async () => {
    (buildZip as Mock).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), ok: 2, failed: [], results: [] });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_ZIP' && cb) cb({ status: 'success', message: 'Saved ZIP archive.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/as zip archive/i);

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        // b64 is a STRING, not a Uint8Array — a typed array wouldn't survive
        // Chrome's JSON message serialization (would arrive with no .length).
        expect.objectContaining({ type: 'DOWNLOAD_ZIP', filename: 'example.com-media-2026-07-07.zip', b64: expect.any(String) }),
        expect.any(Function),
      ),
    );
    expect(buildZip).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ src: 'a.jpg' }), expect.objectContaining({ src: 'b.jpg' })]),
      expect.anything(), expect.anything(), expect.anything(),
    );
    expect(await screen.findByText('Saved ZIP archive.')).toBeInTheDocument();
  });

  it('falls back to individual downloads when the ZIP fetched nothing (ok === 0)', async () => {
    (buildZip as Mock).mockResolvedValue({
      bytes: new Uint8Array(0), ok: 0,
      failed: [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })], results: [],
    });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_IMAGES' && cb) cb({ status: 'success', message: 'Downloaded 2 files.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/as zip archive/i);

    // Total-fetch-failure routes through the browser's own fetch (DOWNLOAD_IMAGES)…
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
        expect.any(Function),
      ),
    );
    // …and never dispatches a DOWNLOAD_ZIP for an empty archive.
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter((c) => c[0]?.type === 'DOWNLOAD_ZIP'),
    ).toHaveLength(0);
  });

  it('the ZIP fallback archives originals — convert-on does not convert the un-fetchable items', async () => {
    // Convert-on-download applies only to "As separate files". The ZIP action
    // archives originals, so even its all-fetch-failed fallback must NOT convert.
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { convertImagesTo: 'png' } }));
    (buildZip as Mock).mockResolvedValue({
      bytes: new Uint8Array(0), ok: 0,
      failed: [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })], results: [],
    });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_IMAGES' && cb) cb({ status: 'success', message: 'Downloaded 2 files.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/as zip archive/i);

    // Fallback dispatches a plain DOWNLOAD_IMAGES…
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
        expect.any(Function),
      ),
    );
    // …and never converts: no convertImage call, no DOWNLOAD_BYTES dispatched.
    expect(convertImage).not.toHaveBeenCalled();
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter((c) => c[0]?.type === 'DOWNLOAD_BYTES'),
    ).toHaveLength(0);
  });

  it('zips the fetched items and downloads the un-fetchable ones individually', async () => {
    (buildZip as Mock).mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]), ok: 1,
      failed: [image({ src: 'b.jpg' })], results: [],
    });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_ZIP' && cb) cb({ status: 'success', message: 'Saved 1 file to ZIP.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/as zip archive/i);

    // The failed item falls back to a per-file download…
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOWNLOAD_IMAGES',
          images: expect.arrayContaining([expect.objectContaining({ src: 'b.jpg' })]),
        }),
      ),
    );
    // …while the rest still go out as a ZIP, and the status notes the split.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_ZIP' }), expect.any(Function),
    );
    expect(await screen.findByText(/couldn't be fetched/i)).toBeInTheDocument();
  });

  // ── Copy / export links ────────────────────────────────────────────────────
  it('copies the shown media links to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/copy links/i);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('a.jpg\nb.jpg'));
    expect(await screen.findByText('Copied 2 links.')).toBeInTheDocument();
  });

  it('exports the shown media links as a .txt via the background', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/export links/i);

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_TEXT', text: 'a.jpg\nb.jpg', mime: 'text/plain' }),
      ),
    );
    expect(await screen.findByText('Exported 2 links.')).toBeInTheDocument();
  });

  // ── Selection ──────────────────────────────────────────────────────────────
  it('shift-click selects the whole range between two checkboxes', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' }), image({ src: 'c.jpg' })]} />);
    await screen.findByText('Filters');

    const boxes = () => screen.getAllByRole('checkbox', { name: /select item|deselect item/i });
    fireEvent.click(boxes()[0]); // anchor on the first item
    fireEvent.click(boxes()[2], { shiftKey: true }); // extend selection across the run

    expect(await screen.findByRole('button', { name: /download selected 3/i })).toBeInTheDocument();
  });

  it('shift-click range excludes a pending image caught in the middle of the run', async () => {
    // Regression: handleSelectRange used to only guard unresolvedVideo/hlsManifest,
    // so a pending Twitter image (unresolvedImage) sitting inside the clicked span
    // got silently added to the selection too, inflating the "N selected" count.
    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image',
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), pendingImage, image({ src: 'c.jpg' })]} />);
    await screen.findByText('Filters');

    // The pending image renders no checkbox, so only a.jpg and c.jpg have one.
    const boxes = () => screen.getAllByRole('checkbox', { name: /select item|deselect item/i });
    expect(boxes()).toHaveLength(2);
    fireEvent.click(boxes()[0]); // anchor on a.jpg (full-list index 0)
    fireEvent.click(boxes()[1], { shiftKey: true }); // extend to c.jpg (full-list index 2) — spans the pending image

    // Only the two real items are selected — the pending image never joined the set.
    expect(await screen.findByRole('button', { name: /download selected 2/i })).toBeInTheDocument();
  });

  it('zips only the ticked set when a selection is active', async () => {
    (buildZip as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ok: 1, failed: [], results: [] });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_ZIP' && cb) cb({ status: 'success', message: 'Saved ZIP archive.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    // Tick only the first item, then zip the selection.
    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);
    await screen.findByRole('button', { name: /download selected 1/i });
    await openMenuAndChoose(/as zip archive/i);

    await waitFor(() => expect(buildZip).toHaveBeenCalled());
    // buildZip acts on the one ticked src, not the whole shown set.
    expect(buildZip).toHaveBeenCalledWith(
      [expect.objectContaining({ src: 'a.jpg' })],
      expect.anything(), expect.anything(), expect.anything(),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_ZIP' }), expect.any(Function),
    );
  });

  // ── Favourite toggle ───────────────────────────────────────────────────────
  it('toggles a favourite on (ADD_FAVOURITE) and back off (REMOVE_FAVOURITE)', async () => {
    render(<App collect={async () => [image({ src: 'fav.jpg' })]} />);
    await screen.findByText('Filters');

    // Add: dispatches ADD_FAVOURITE and stars the tile.
    await userEvent.click(screen.getByRole('button', { name: /add favourite/i }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ADD_FAVOURITE', entry: expect.objectContaining({ src: 'fav.jpg', kind: 'image' }) }),
      ),
    );
    const removeBtn = await screen.findByRole('button', { name: /remove favourite/i });
    expect(screen.getByLabelText('Favourited')).toBeInTheDocument();

    // Remove: dispatches REMOVE_FAVOURITE and un-stars the tile.
    await userEvent.click(removeBtn);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REMOVE_FAVOURITE', src: 'fav.jpg' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /add favourite/i })).toBeInTheDocument();
  });

  // ── Footer status / counts ─────────────────────────────────────────────────
  it('footer shows the shown/total counts and switches to a selected/Clear affordance', async () => {
    const { container } = render(
      <App collect={async () => [image({ src: 'a.jpg', type: 'jpeg' }), image({ src: 'b.png', type: 'png' })]} />,
    );
    await screen.findByText('Filters');
    const footerText = () => container.querySelector('footer')?.textContent ?? '';

    // Unfiltered, unselected: the count reads "2 / 2" (no "shown" suffix).
    await waitFor(() => expect(footerText()).toMatch(/2\s*\/\s*2/));

    // Filter to jpeg → 1 of 2 shown. (Format now lives in the "More" popover.)
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'jpeg' } });
    await waitFor(() => expect(footerText()).toMatch(/1\s*\/\s*2\s*shown/));

    // Clear the filter, then select all → footer reads "1 selected" with Clear.
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'all' } });
    await userEvent.click(await screen.findByRole('checkbox', { name: /select all shown/i }));
    await waitFor(() => expect(footerText()).toMatch(/2\s*selected/));
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
  });

  it('keeps a Clear affordance beside a sticky status line while a selection is live', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_IMAGES' && cb) cb({ status: 'success', message: 'Downloaded 1 file.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);
    await userEvent.click(await screen.findByRole('button', { name: /download selected 1/i }));

    // The response status is shown, and Clear stays reachable underneath it.
    expect(await screen.findByText('Downloaded 1 file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
  });

  // ── Deep scan failure ──────────────────────────────────────────────────────
  it('surfaces a deep scan failure as a status message', async () => {
    (deepScanActiveTab as Mock).mockRejectedValueOnce(new Error('scan crashed'));
    render(<App collect={async () => [image({ src: 'a.jpg' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));

    expect(await screen.findByText('scan crashed')).toBeInTheDocument();
  });

  // ── Deep-scan cap notices ──────────────────────────────────────────────────
  it('notes remaining media when a deep scan stops at the time limit', async () => {
    (deepScanActiveTab as Mock).mockImplementationOnce(async (onProgress) => {
      onProgress({ type: 'DEEP_SCAN_PROGRESS', found: 1, scrolls: 1, elapsedMs: 100, reason: 'max-time' });
      return [image({ src: 'https://cdn.com/deep.jpg' })];
    });
    render(<App collect={async () => [image({ src: 'https://cdn.com/a.jpg' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));

    expect(await screen.findByText(/stopped at the time limit/i)).toBeInTheDocument();
  });

  it('notes remaining media when a deep scan stops at the scroll limit', async () => {
    (deepScanActiveTab as Mock).mockImplementationOnce(async (onProgress) => {
      onProgress({ type: 'DEEP_SCAN_PROGRESS', found: 1, scrolls: 40, elapsedMs: 100, reason: 'max-scrolls' });
      return [image({ src: 'https://cdn.com/deep.jpg' })];
    });
    render(<App collect={async () => [image({ src: 'https://cdn.com/a.jpg' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));

    expect(await screen.findByText(/stopped at the scroll limit/i)).toBeInTheDocument();
  });

  // ── Live badge sync via storage.onChanged ──────────────────────────────────
  it('re-checks downloaded-on-disk when history changes, revealing the Downloaded badge', async () => {
    // The on-disk set is asked for over the background (GET_DOWNLOADED_SRCS); it
    // starts empty and gains the item after the "download" writes a history entry.
    let disk: string[] = [];
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'GET_DOWNLOADED_SRCS' && cb) cb(disk);
    });
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;

    render(<App collect={async () => [image({ src: 'https://c/a.jpg' })]} />);
    await screen.findByText('Filters');
    // Nothing downloaded yet → no badge.
    expect(screen.queryByLabelText('Downloaded')).toBeNull();

    // The download lands: history changes, so the downloaded-mark listener re-asks
    // and now the file is on disk. The listener registered first on this mount is
    // the downloaded-mark one (before history/favourites/excluded).
    disk = ['https://c/a.jpg'];
    // Fire the change on every listener registered this mount (the download-queue
    // panel also subscribes; it ignores non-queue changes) so this stays robust to
    // listener registration order.
    const fireAll = (change: Record<string, unknown>) =>
      addListener.mock.calls.slice(before).forEach(([fn]) => fn(change, 'local'));
    await act(async () => {
      fireAll({ [HISTORY_KEY]: { newValue: [] } });
      await Promise.resolve();
    });

    expect(await screen.findByLabelText('Downloaded')).toBeInTheDocument();
  });

  it('re-derives the filtered grid live when a download completes while the Downloaded filter is active', async () => {
    // Unlike the badge test above, the Downloaded filter is switched on FIRST (via
    // the toolbar → handleFilterChange), and only THEN does a download land and
    // history change. The user never re-touches the filter afterwards, so the only
    // thing that can reveal photo-a is the live re-filter effect (App.tsx ~86-93)
    // re-applying applyToolbarFilters off the updated downloadedSrcs set.
    let disk: string[] = [];
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'GET_DOWNLOADED_SRCS' && cb) cb(disk);
    });
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;

    render(
      <App
        collect={async () => [
          image({ src: 'https://c/a.jpg', alt: 'photo-a' }),
          image({ src: 'https://c/b.jpg', alt: 'photo-b' }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    // Turn the Downloaded filter on via the toolbar's State chip (handleFilterChange path).
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Downloaded' }));

    // Nothing is on disk yet, so the active filter hides both items.
    expect(screen.queryByAltText('photo-a')).toBeNull();
    expect(screen.queryByAltText('photo-b')).toBeNull();

    // The download lands: history changes while the Downloaded filter is STILL
    // active and untouched. Fire on every listener registered this mount (the
    // download-queue panel also subscribes; it ignores non-queue changes) so this
    // stays robust to listener registration order.
    disk = ['https://c/a.jpg'];
    const fireAll = (change: Record<string, unknown>) =>
      addListener.mock.calls.slice(before).forEach(([fn]) => fn(change, 'local'));
    await act(async () => {
      fireAll({ [HISTORY_KEY]: { newValue: [] } });
      await Promise.resolve();
    });

    // Only the now-downloaded item reappears — the still-not-downloaded one stays
    // hidden — proving the grid was re-derived from downloadedSrcs, not just a badge.
    expect(await screen.findByAltText('photo-a')).toBeInTheDocument();
    expect(screen.queryByAltText('photo-b')).toBeNull();
  });

  it('reflects a favourite added elsewhere via a storage change (badge appears)', async () => {
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;

    render(<App collect={async () => [image({ src: 'https://c/fav.jpg' })]} />);
    await screen.findByText('Filters');
    expect(screen.queryByLabelText('Favourited')).toBeNull();

    // The favourites listener re-reads the committed store (not the event's
    // newValue), so seed storage before firing. Fire on every mount listener (the
    // download-queue panel subscribes too and ignores non-queue changes) to stay
    // robust to registration order.
    const fireAll = (change: Record<string, unknown>) =>
      addListener.mock.calls.slice(before).forEach(([fn]) => fn(change, 'local'));
    await act(async () => {
      await chrome.storage.local.set({ [FAVOURITES_KEY]: [{ src: 'https://c/fav.jpg' }] });
      fireAll({ [FAVOURITES_KEY]: { newValue: [{ src: 'https://c/fav.jpg' }] } });
    });

    expect(await screen.findByLabelText('Favourited')).toBeInTheDocument();
  });

  it('removes the favourite badge when the stored favourites are cleared', async () => {
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;
    render(<App collect={async () => [image({ src: 'https://c/fav.jpg' })]} />);
    await screen.findByText('Filters');

    // The listener re-reads the committed store on any FAVOURITES_KEY change, so
    // drive it by mutating storage: first add the favourite, then clear it. Fire on
    // every mount listener (the queue panel subscribes too, ignoring non-queue
    // changes) so this is robust to listener registration order.
    const fireAll = (change: Record<string, unknown>) =>
      addListener.mock.calls.slice(before).forEach(([fn]) => fn(change, 'local'));
    await act(async () => {
      await chrome.storage.local.set({ [FAVOURITES_KEY]: [{ src: 'https://c/fav.jpg' }] });
      fireAll({ [FAVOURITES_KEY]: { newValue: [{ src: 'https://c/fav.jpg' }] } });
    });
    expect(await screen.findByLabelText('Favourited')).toBeInTheDocument();
    await act(async () => {
      await chrome.storage.local.set({ [FAVOURITES_KEY]: [] });
      fireAll({ [FAVOURITES_KEY]: {} });
    });
    await waitFor(() => expect(screen.queryByLabelText('Favourited')).toBeNull());
  });

  // ── Header panels ──────────────────────────────────────────────────────────
  it('opens and closes the Excluded sources panel from the header', async () => {
    render(<App collect={async () => []} />);
    await userEvent.click(await screen.findByRole('button', { name: /excluded sources/i }));
    expect(await screen.findByRole('dialog', { name: 'Excluded sources' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}'); // onClose → setShowExcluded(false)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluded sources' })).toBeNull());
  });

  it('opens and closes the Download history panel from the header', async () => {
    render(<App collect={async () => []} />);
    await userEvent.click(await screen.findByRole('button', { name: /download history/i }));
    expect(await screen.findByRole('dialog', { name: 'Download History' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}'); // onClose → setShowHistory(false)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Download History' })).toBeNull());
  });

  // ── Convert-on-download: passthrough-only ──────────────────────────────────
  it('reports a plain send when conversion is on but nothing is convertible', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { convertImagesTo: 'png' } }));
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) => { if (cb) cb({ status: 'success', message: 'ok' }); });

    render(
      <App
        collect={async () => [
          image({ src: 'icon.svg', type: 'svg', kind: 'image' }),
          image({ src: 'clip.mp4', type: 'mp4', kind: 'video' }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 2/i }));

    // Both items are non-convertible → sent as-is; no canvas conversion runs.
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOWNLOAD_IMAGES',
          images: expect.arrayContaining([
            expect.objectContaining({ src: 'icon.svg' }),
            expect.objectContaining({ src: 'clip.mp4' }),
          ]),
        }),
      ),
    );
    expect(await screen.findByText(/sent 2 files to downloads/i)).toBeInTheDocument();
    expect(convertImage).not.toHaveBeenCalled();
  });

  // ── ZIP: the popup-supplied fetch + progress relay ─────────────────────────
  it('drives the ZIP builder with a working fetch and a live progress relay', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    (buildZip as Mock).mockImplementation(async (_imgs, _s, _url, opts) => {
      // Exercise exactly the fetch + onProgress the popup wires into buildZip.
      await opts.fetch('https://c/a.jpg');
      opts.onProgress(1, 2);
      return { bytes: new Uint8Array([1]), ok: 1, failed: [], results: [] };
    });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_ZIP' && cb) cb({ status: 'success', message: 'Saved ZIP archive.' });
    });

    render(<App collect={async () => [image({ src: 'https://c/a.jpg' }), image({ src: 'https://c/b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/as zip archive/i);

    await waitFor(() => expect(buildZip).toHaveBeenCalled());
    // The fetch the popup handed to buildZip really reaches the network layer.
    expect(fetchSpy).toHaveBeenCalledWith('https://c/a.jpg');
    expect(await screen.findByText('Saved ZIP archive.')).toBeInTheDocument();
  });

  it('surfaces a ZIP save error returned by the background', async () => {
    (buildZip as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ok: 2, failed: [], results: [] });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_ZIP' && cb) {
        (chrome.runtime as { lastError?: unknown }).lastError = { message: 'disk full' };
        cb(undefined);
        (chrome.runtime as { lastError?: unknown }).lastError = undefined;
      }
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await openMenuAndChoose(/as zip archive/i);

    expect(await screen.findByText(/error: disk full/i)).toBeInTheDocument();
  });

  // ── Selection pruning on a filter change ───────────────────────────────────
  it('drops a ticked item from the selection when a filter hides it', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg', type: 'jpeg' }), image({ src: 'b.png', type: 'png' })]} />);
    await screen.findByText('Filters');

    // Tick the jpeg.
    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);
    expect(await screen.findByRole('button', { name: /download selected 1/i })).toBeInTheDocument();

    // Filter to PNG only → the ticked jpeg is no longer shown → selection is pruned.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'png' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull());
    // Footer reverts to the plain bulk button for the one shown png.
    expect(screen.getByRole('button', { name: /^download 1$/i })).toBeInTheDocument();
  });

  // ── Copy / export links for the SELECTED set ───────────────────────────────
  it('copies only the selected media links', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);
    await screen.findByRole('button', { name: /download selected 1/i });
    await openMenuAndChoose(/copy links/i);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('a.jpg'));
    expect(await screen.findByText('Copied 1 link.')).toBeInTheDocument();
  });

  it('exports only the selected media links', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[1]);
    await screen.findByRole('button', { name: /download selected 1/i });
    await openMenuAndChoose(/export links/i);

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_TEXT', text: 'b.jpg', mime: 'text/plain' }),
      ),
    );
    expect(await screen.findByText('Exported 1 link.')).toBeInTheDocument();
  });

  // ── HLS capture progress relay ─────────────────────────────────────────────
  it('relays HLS capture progress into the footer while the stream is captured', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { captureHlsStreams: true } }));
    // Intercept CAPTURE_STREAM: keep its runId + callback so the test can stream a
    // progress event first, then complete the capture.
    let captureCb: ((r: { status: string }) => void) | undefined;
    let runId: string | undefined;
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'CAPTURE_STREAM') { runId = msg.runId; captureCb = cb; }
    });

    const hlsItem = image({
      src: 'https://x/master.m3u8', hlsManifest: 'https://x/master.m3u8', type: 'm3u8', kind: 'video',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    });
    render(<App collect={async () => [hlsItem]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByTitle('Capture stream'));

    // requestCaptureStream has sent CAPTURE_STREAM and registered its progress listener.
    await waitFor(() => expect(runId).toBeDefined());
    const onMessageCalls = (chrome.runtime.onMessage.addListener as Mock).mock.calls;
    const progressListener = onMessageCalls[onMessageCalls.length - 1][0];

    // The background broadcasts progress for this run → the footer shows 3/8.
    await act(async () => progressListener({ type: 'CAPTURE_PROGRESS', runId, done: 3, total: 8 }));
    const bar = await screen.findByRole('progressbar', { name: 'Capturing stream' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '8');

    // Completing the capture replaces the progress line with the returned status.
    await act(async () => captureCb!({ status: 'Captured clip.mp4 — 8 segments.' }));
    expect(await screen.findByText(/Captured clip\.mp4 — 8 segments/)).toBeInTheDocument();
  });

  // ── Corrupt / empty collection results ─────────────────────────────────────
  it('treats a non-array collection result as an empty page', async () => {
    render(<App collect={async () => null as unknown as ImageInfo[]} />);
    // raw normalises to [] → the empty (not error) state renders.
    expect(await screen.findByText('No media here')).toBeInTheDocument();
  });

  it('shows "unknown error" when the collector throws a non-Error', async () => {
    render(<App collect={async () => { throw 'kaboom-string'; }} />);
    expect(await screen.findByText(/can't read this page/i)).toBeInTheDocument();
    expect(screen.getByText('unknown error')).toBeInTheDocument();
  });

  it('shows "deep scan failed" when the scan rejects with a non-Error', async () => {
    (deepScanActiveTab as Mock).mockRejectedValueOnce('nope-string');
    render(<App collect={async () => [image({ src: 'a.jpg' })]} />);
    await screen.findByText('Filters');
    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));
    expect(await screen.findByText('deep scan failed')).toBeInTheDocument();
  });

  // ── Storage listeners ignore irrelevant changes ────────────────────────────
  it('ignores storage changes for the wrong area or key', async () => {
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;
    render(<App collect={async () => [image({ src: 'https://c/a.jpg' })]} />);
    await screen.findByText('Filters');
    const [downloaded, fav, excluded] = [before, before + 1, before + 2].map((i) => addListener.mock.calls[i][0]);

    await act(async () => {
      downloaded({ [HISTORY_KEY]: {} }, 'sync'); // right key, wrong area
      downloaded({ other: {} }, 'local'); // right area, wrong key
      fav({ [FAVOURITES_KEY]: { newValue: [{ src: 'https://c/other.jpg' }] } }, 'sync'); // wrong area
      excluded({ [EXCLUDED_KEY]: {} }, 'sync'); // wrong area
      await Promise.resolve();
    });

    // Nothing reacted: no favourite badge, item still shown, still downloadable.
    expect(screen.queryByLabelText('Favourited')).toBeNull();
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  // ── HLS-gated single-video resolution ──────────────────────────────────────
  it('leaves a video pending (not failed) when it resolves to an HLS stream but capture is off', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { resolveOriginals: false, captureHlsStreams: false } }));
    (requestResolveOriginals as Mock).mockResolvedValueOnce({ 'poster.jpg': { url: 'https://x/s.m3u8', hls: true } });

    render(<App collect={async () => [pendingVideo]} />);
    fireEvent.click(await screen.findByTitle('Get video'));
    await waitFor(() => expect(requestResolveOriginals).toHaveBeenCalled());

    // applyResolved returns null (HLS + capture off) → NOT a hard failure: the tile
    // stays quietly pending ("not fetched"), never "couldn't fetch".
    await waitFor(() => expect(screen.getByText('not fetched')).toBeInTheDocument());
    expect(screen.queryByText(/couldn't fetch/i)).toBeNull();
  });

  // ── Selection toggle off + header-checkbox clear ───────────────────────────
  it('unticks an item on a second click, and the header checkbox clears a full selection', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');
    const firstTile = () => screen.getAllByRole('checkbox', { name: /select item|deselect item/i })[0];

    await userEvent.click(firstTile()); // select a.jpg
    expect(await screen.findByRole('button', { name: /download selected 1/i })).toBeInTheDocument();
    await userEvent.click(firstTile()); // toggle a.jpg back off
    await waitFor(() => expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull());

    // Select-all, then click the header checkbox again (now "Clear selection") to reset.
    await userEvent.click(screen.getByRole('checkbox', { name: /select all shown/i }));
    expect(await screen.findByRole('button', { name: /download selected 2/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /clear selection/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull());
  });

  // ── Bubble surface uses the current page as the download source ─────────────
  it('uses the current page URL as the download source in the bubble surface', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) => {
      if (cb) cb({ status: 'success', message: 'Downloaded 1 file.' });
    });
    render(<App surface="bubble" collect={async () => [image({ src: 'a.jpg' })]} />);
    await screen.findByText('Filters');

    (chrome.tabs.query as Mock).mockClear(); // shared mock accumulates across the suite
    fireEvent.click(screen.getByRole('button', { name: /download 1/i }));

    // In the bubble, the source is location.href — chrome.tabs is never queried.
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES', sourcePage: expect.objectContaining({ url: expect.any(String) }) }),
        expect.any(Function),
      ),
    );
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  // ── Download error with no message → "unknown error" ───────────────────────
  it('falls back to "unknown error" when a download error carries no message', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = {}; // present but message-less
      cb(undefined);
      (chrome.runtime as { lastError?: unknown }).lastError = undefined;
    });
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /download 1/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/error: unknown error/i));
  });

  // ── "Get all videos": partial failure ──────────────────────────────────────
  it('flags only the videos that fail during a batch "Get all videos"', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: false } }));
    const resolveMock = requestResolveOriginals as Mock;
    resolveMock.mockResolvedValueOnce({ 'poster1.jpg': { url: 'https://video.twimg.com/a.mp4' } }); // poster2 unresolved

    render(
      <App
        collect={async () => [
          image({ src: 'poster1.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' } }),
          image({ src: 'poster2.jpg', kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '2' } }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /get all videos \(2\)/i }));

    // poster1 resolves → downloadable; poster2 stays and is flagged failed.
    await waitFor(() => expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument());
    expect(await screen.findByText(/couldn't fetch/i)).toBeInTheDocument();
  });

  // ── Convert: source fetch fails → original saved ───────────────────────────
  it('downloads the original when the source fetch is not ok during conversion', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { convertImagesTo: 'png' } }));
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'x.jpg', type: 'jpeg', kind: 'image' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 1/i }));

    // A non-ok fetch throws before convertImage runs → the item is saved as-is.
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES', images: expect.arrayContaining([expect.objectContaining({ src: 'x.jpg' })]) }),
      ),
    );
    expect(convertImage).not.toHaveBeenCalled();
    expect(await screen.findByText(/couldn't convert/i)).toBeInTheDocument();
  });

  // ── Favourite entry carries poster thumbnail + page title ──────────────────
  it('records a favourite with its poster thumbnail and the source page title', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ url: 'https://pg', title: 'My Page' }]);
    render(<App collect={async () => [image({ src: 'v.mp4', kind: 'video', poster: 'https://c/p.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getByRole('button', { name: /add favourite/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADD_FAVOURITE',
          entry: expect.objectContaining({ src: 'v.mp4', thumbnailSrc: 'https://c/p.jpg', sourcePageTitle: 'My Page' }),
        }),
      ),
    );
  });

  // ── Size enrichment leaves already-known sizes untouched ───────────────────
  it('enriches only the remote image lacking a size, leaving the known one intact', async () => {
    global.fetch = vi.fn().mockResolvedValue({ headers: { get: () => '4096' } }) as unknown as typeof fetch;
    render(<App collect={async () => [image({ src: 'known.jpg', fileSize: 1024 }), image({ src: 'remote.jpg', fileSize: 0 })]} />);
    await screen.findByText('Filters');

    // remote.jpg enriches to 4 KB; known.jpg keeps its 1 KB (the map's pass-through arm).
    expect(await screen.findByText('4 KB')).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
  });
});

// ── smartPageDefaults (opt-in page-type-seeded filters, #292 Task C3) ──────────
// useMediaEngine.fetchImages awaits getPageType() only when the loaded settings
// have smartPageDefaults on, then seeds FilterToolbar's initialFilters from
// pageDefaults(pageType). Exercised here (rather than a standalone
// useMediaEngine.test.ts) because App is the only existing harness that mounts
// the hook, and it already establishes the exact machinery needed — vi.mock of
// an active-tab module (see deep-scan-active-tab / resolve-originals-active
// above) — so no new test infrastructure is introduced.
describe('smartPageDefaults (page-type-seeded filters)', () => {
  beforeEach(() => {
    (getPageType as Mock).mockReset();
  });

  it('seeds Sort/Size from the classified page type when smartPageDefaults is on', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { smartPageDefaults: true } }));
    (getPageType as Mock).mockResolvedValue('gallery');

    // 500x500 lands in the 'medium' size bucket (256-1024 edge) so it's a live
    // option in availableFilterOptions — otherwise FilterToolbar's stale-option
    // cleanup effect would immediately reset the seeded sizeBucket back to 'all'.
    render(
      <App
        collect={async () => [
          image({ src: 'a.jpg', width: 500, height: 500 }),
          image({ src: 'b.jpg', width: 500, height: 500 }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    expect(getPageType).toHaveBeenCalled();
    // pageDefaults('gallery') === { sizeBucket: 'medium', sortBy: 'size', sortDir: 'desc' },
    // merged over DEFAULT_FILTERS as FilterToolbar's initial state.
    expect(screen.getByLabelText('Sort order')).toHaveValue('size');
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument(); // active size chip
  });

  it('leaves the default (unseeded) filters alone when smartPageDefaults is off', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { smartPageDefaults: false } }));

    render(<App collect={async () => [image({ src: 'a.jpg' })]} />);
    await screen.findByText('Filters');

    expect(getPageType).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Sort order')).toHaveValue('default');
    expect(screen.queryByRole('button', { name: 'Medium' })).not.toBeInTheDocument();
  });
});
