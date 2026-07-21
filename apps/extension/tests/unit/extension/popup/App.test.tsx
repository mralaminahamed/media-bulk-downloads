import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/extension/popup/App';
import { ImageInfo } from '@mbd/core/types';
import { deepScanActiveTab } from '@/extension/shared/active-tab/deep-scan-active-tab';
import { requestResolveOriginals } from '@/extension/shared/active-tab/resolve-originals-active';
import { getPageType } from '@/extension/shared/active-tab/collect-active-tab';
import { excludedMatchers, EXCLUDED_KEY } from '@mbd/storage/excluded';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { HISTORY_KEY } from '@mbd/storage/history';
import { FAVOURITES_KEY } from '@mbd/storage/favourites';
import { buildZip } from '@mbd/core/download/zip';
import { convertImage } from '@mbd/core/download/convert/convert';

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

vi.mock('@/extension/shared/active-tab/collect-active-tab', () => ({
  collectFromActiveTab: vi.fn(),
  getPageType: vi.fn(async () => 'unknown'),
}));

vi.mock('@mbd/storage/excluded', async () => {
  const { SrcKeySet: KeySet } = await vi.importActual<typeof import('@mbd/core/collection/canonical')>('@mbd/core/collection/canonical');
  return {
    excludedMatchers: vi.fn(async () => ({ urls: new KeySet(), hosts: new Set() })),
    loadExcluded: vi.fn(async () => []),
    EXCLUDED_KEY: 'excluded',
  };
});

vi.mock('@mbd/core/download/zip', () => ({
  buildZip: vi.fn(),
  zipFileName: vi.fn(() => 'example.com-media-2026-07-07.zip'),
}));

vi.mock('@mbd/core/download/convert/convert', async () => ({
  ...(await vi.importActual<typeof import('@mbd/core/download/convert/convert')>('@mbd/core/download/convert/convert')),
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
    await screen.findByText('No media here');
  });

  it('shows the scanning state initially', async () => {
    render(<App collect={() => new Promise(() => {})} />);
    expect(screen.getByText('scanning this page')).toBeInTheDocument();
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

  it('a per-host override drives the grid while the editor still edits global (#293)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_k: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: { minimumImageSize: 0 } }),
    );
    await chrome.storage.local.set({ perHostSettings: { 'e.com': { minimumImageSize: 500 } } });
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 1, url: 'https://e.com/gallery', title: 't' }]);
    const collect = async () => [
      image({ src: 'https://e.com/big.jpg', width: 800, height: 800 }),
      image({ src: 'https://e.com/tiny.jpg', width: 10, height: 10 }),
    ];
    render(<App collect={collect} />);
    await screen.findByText('Filters');
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download 2/i })).toBeNull();
    await chrome.storage.local.clear();
    (chrome.tabs.query as Mock).mockResolvedValue([]);
  });

  it('FilterToolbar Base64 control reflects the per-host effective setting, not global (#293)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_k: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: { excludeBase64Images: false } }),
    );
    await chrome.storage.local.set({ perHostSettings: { 'e.com': { excludeBase64Images: true } } });
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 1, url: 'https://e.com/gallery', title: 't' }]);
    render(<App collect={async () => [image({ src: 'https://e.com/a.jpg', width: 800, height: 800 })]} />);
    await screen.findByText('Filters');
    const filterMore = screen.getAllByRole('button', { name: /More/i }).find((b) => b.getAttribute('aria-controls') === 'filter-more');
    fireEvent.click(filterMore!);
    await waitFor(() => expect(screen.getByRole('switch', { name: /base64/i })).toBeDisabled());
    await chrome.storage.local.clear();
    (chrome.tabs.query as Mock).mockResolvedValue([]);
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

    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();

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

    expect(screen.getByRole('button', { name: /download 2/i })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);

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

  it('shows the filtered-empty state (not a blank grid) when filters hide everything, and Clear filters restores it', async () => {
    render(<App collect={async () => [image({ type: 'png' })]} />);
    await screen.findByText('Filters');

    // A format filter matching nothing hides the only item → grid would be blank.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'jpeg' } });

    expect(await screen.findByText(/nothing matches your filters/i)).toBeInTheDocument();

    // Clear filters from the empty state brings the grid back.
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() =>
      expect(screen.queryByText(/nothing matches your filters/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^download$/i })).toBeEnabled();
  });

  it('lazily enriches remote image sizes after load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      headers: { get: () => '2048' },
    }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'https://cdn.example.com/remote.jpg', fileSize: 0 })]} />);
    await screen.findByText('Filters');

    expect(await screen.findByText('2 KB')).toBeInTheDocument();
  });

  it('never fetches a pending image\'s placeholder src during size enrichment', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ headers: { get: () => '2048' } });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image', fileSize: 0,
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [image({ src: 'https://cdn.example.com/remote.jpg', fileSize: 0 }), pendingImage]} />);
    await screen.findByText('Filters');

    expect(await screen.findByText('2 KB')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: /Display/i }));
    fireEvent.click(screen.getByRole('switch', { name: /show image count/i }));
    fireEvent.click(screen.getByText('Save'));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_SETTINGS', patch: expect.objectContaining({ showImageCount: false }) }),
    );
  });

  it('persists the Bubble corner + Panel position dropdowns, keeping the drag-only offsets', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubblePosition: { corner: 'bottom-right', x: 99, y: 88 }, bubblePanelPoint: { x: 77, y: 66 } } }));
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Display/i }));
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    fireEvent.change(screen.getByLabelText('Bubble corner:'), { target: { value: 'top-left' } });
    fireEvent.change(screen.getByLabelText('Panel position:'), { target: { value: 'center' } });
    fireEvent.click(screen.getByText('Save'));

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

    const mountListeners = addListener.mock.calls.slice(before).map((c) => c[0]);
    await act(async () => {
      mountListeners.forEach((fn) =>
        fn({ settings: { newValue: { bubbleEnabled: true, bubbleWidth: 600, bubbleHeight: 700 } } }, 'sync'));
    });

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Display/i }));
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

    await waitFor(() => expect(headerCount()).toBe('2'));

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i }));
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(headerCount()).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));
    await waitFor(() => expect(headerCount()).toBe('3'));

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i }));
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(headerCount()).toBe('4'));
  });

  it('live re-filters the grid when Exclude emoji is toggled on', async () => {
    const emojiItem = image({
      src: 'https://abs.twimg.com/emoji/v2/svg/1f9f8.svg', type: 'svg', kind: 'image',
      width: 0, height: 0, fileSize: 0, isBase64: false, alt: '',
    });
    const { container } = render(
      <App collect={async () => [emojiItem, image({ src: 'https://c/photo.jpg' })]} />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;

    await waitFor(() => expect(headerCount()).toBe('2'));

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i }));
    fireEvent.click(screen.getByRole('switch', { name: /exclude emoji/i }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(headerCount()).toBe('1'));
  });

  it('live-removes excluded sources from the grid on a storage change', async () => {
    const matchersMock = excludedMatchers as Mock;
    matchersMock.mockResolvedValueOnce({ urls: new SrcKeySet(), hosts: new Set() });

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

    await waitFor(() => expect(headerCount()).toBe('2'));

    matchersMock.mockResolvedValueOnce({ urls: new SrcKeySet(), hosts: new Set(['ads.com']) });

    const addListenerMock = chrome.storage.onChanged.addListener as Mock;
    const excludedListener = addListenerMock.mock.calls[addListenerMock.mock.calls.length - 1][0];
    await act(async () => {
      excludedListener({ [EXCLUDED_KEY]: { newValue: [] } }, 'local');
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await waitFor(() => expect(headerCount()).toBe('2'));
    expect(requestResolveOriginals).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('"Get all videos" resolves every pending video in one batch and makes them downloadable', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: false } }));
    const resolveMock = requestResolveOriginals as Mock;
    resolveMock.mockClear();
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

    const btn = await screen.findByRole('button', { name: /get all videos \(2\)/i });
    expect(requestResolveOriginals).not.toHaveBeenCalled();

    fireEvent.click(btn);

    await waitFor(() => expect(resolveMock).toHaveBeenCalledTimes(1));
    expect(resolveMock).toHaveBeenCalledWith([
      { src: 'poster1.jpg', hint: { platform: 'twitter', id: '1' } },
      { src: 'poster2.jpg', hint: { platform: 'twitter', id: '2' } },
    ]);

    await waitFor(() => expect(screen.getByRole('button', { name: /download 2/i })).toBeInTheDocument());
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
    await waitFor(() => expect(headerCount()).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video?.getAttribute('src')).toBe('https://video.twimg.com/hi.mp4');
    });
  });

  it('a video that fails to resolve stays visible as a pending poster and does not wipe the other items', async () => {
    const resolveMock = requestResolveOriginals as Mock;
    resolveMock.mockResolvedValue({});
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
    await waitFor(() => expect(headerCount()).toBe('2'));
    await new Promise((r) => setTimeout(r, 30));
    expect(headerCount()).toBe('2');
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();

    resolveMock.mockResolvedValue({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } });
  });

  it('shows a pending video but excludes it from the download count', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), pendingVideo]} />);
    await screen.findByText('Filters');
    expect(screen.getByText('items on this page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('shows a pending image but excludes it from the download count', async () => {
    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image',
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), pendingImage]} />);
    await screen.findByText('Filters');
    expect(screen.getByText('items on this page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('opens and closes the Favourites panel from the header', async () => {
    render(<App collect={async () => []} />);
    await userEvent.click(await screen.findByRole('button', { name: /favourites/i }));
    expect(await screen.findByText('Saved media')).toBeInTheDocument();
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
    (requestResolveOriginals as Mock).mockResolvedValueOnce({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } });
    render(<App collect={async () => [pendingVideo]} />);

    fireEvent.click(await screen.findByTitle('Get video'));
    await waitFor(() =>
      expect(requestResolveOriginals).toHaveBeenCalledWith([{ src: 'poster.jpg', hint: { platform: 'twitter', id: '123' } }]),
    );
    expect(await screen.findByRole('button', { name: /download 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('tab', { name: /Media/i }));
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('per-item "Exclude this image" dispatches ADD_EXCLUDED with kind url', async () => {
    render(<App collect={async () => [image({ src: 'https://cdn.ads.com/a.png' })]} />);
    await screen.findByText('Filters');

    const detailButtons = await screen.findAllByRole('button', { name: 'View Details' });
    await userEvent.click(detailButtons[0]);
    await userEvent.click(screen.getByTitle('Exclude source'));
    await userEvent.click(await screen.findByText('Exclude this image'));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_EXCLUDED',
        entry: expect.objectContaining({ value: 'https://cdn.ads.com/a.png', kind: 'url', time: expect.any(Number) }),
      }),
    );
    await waitFor(() => expect(screen.queryByTitle('Exclude source')).toBeNull());
  });

  it('per-item "Exclude site …" dispatches ADD_EXCLUDED with kind host and the registrable domain', async () => {
    render(<App collect={async () => [image({ src: 'https://cdn.ads.com/a.png' })]} />);
    await screen.findByText('Filters');

    const detailButtons = await screen.findAllByRole('button', { name: 'View Details' });
    await userEvent.click(detailButtons[0]);
    await userEvent.click(screen.getByTitle('Exclude source'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /exclude site/i }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_EXCLUDED',
        entry: expect.objectContaining({ value: 'ads.com', kind: 'host', time: expect.any(Number) }),
      }),
    );
  });

  it('exposes the exclude control only in the preview modal, not the grid hover', async () => {
    render(<App collect={async () => [image({ src: 'https://cdn.ads.com/a.png' })]} />);
    await screen.findAllByRole('button', { name: 'View Details' });
    expect(screen.queryByTitle('Exclude source')).toBeNull();
    await userEvent.click((await screen.findAllByRole('button', { name: 'View Details' }))[0]);
    expect(screen.getByTitle('Exclude source')).toBeInTheDocument();
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

  it('converts raster images to PNG and passes svg/video through untouched', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { convertImagesTo: 'png' } }));
    (convertImage as Mock).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), ext: 'png', mime: 'image/png' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => { if (cb) cb({ status: 'success', message: 'ok' }); });

    render(
      <App
        collect={async () => [
          image({ src: 'https://cdn.example.com/photo.jpg', type: 'jpeg', kind: 'image' }),
          image({ src: 'icon.svg', type: 'svg', kind: 'image' }),
          image({ src: 'clip.mp4', type: 'mp4', kind: 'video' }),
        ]}
      />,
    );
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 3/i }));

    await waitFor(() => expect(convertImage).toHaveBeenCalled());
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_BYTES', mime: 'image/png' }),
    );
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

    render(<App collect={async () => [image({ src: 'https://cdn.example.com/shot.png', type: 'png', kind: 'image' })]} />);
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
    (convertImage as Mock).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'https://cdn.example.com/broken.jpg', type: 'jpeg', kind: 'image' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 1/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOWNLOAD_IMAGES',
          images: expect.arrayContaining([expect.objectContaining({ src: 'https://cdn.example.com/broken.jpg' })]),
        }),
      ),
    );
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter((c) => c[0]?.type === 'DOWNLOAD_BYTES'),
    ).toHaveLength(0);
    expect(await screen.findByText(/couldn't convert/i)).toBeInTheDocument();
  });

  it('skips a convert-on-download item whose src targets a blocked host (SSRF) — no fetch, no fallback download', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { convertImagesTo: 'png' } }));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as unknown as typeof fetch;

    render(
      <App collect={async () => [image({ src: 'http://169.254.169.254/latest/meta-data/', type: 'jpeg', kind: 'image' })]} />,
    );
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 1/i }));

    await screen.findByText(/Converted 0 images? to PNG\./);
    expect(convertImage).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter(
        (c) => c[0]?.type === 'DOWNLOAD_IMAGES' || c[0]?.type === 'DOWNLOAD_BYTES',
      ),
    ).toHaveLength(0);
  });

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

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
        expect.any(Function),
      ),
    );
    expect(
      (chrome.runtime.sendMessage as Mock).mock.calls.filter((c) => c[0]?.type === 'DOWNLOAD_ZIP'),
    ).toHaveLength(0);
  });

  it('the ZIP fallback archives originals — convert-on does not convert the un-fetchable items', async () => {
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

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
        expect.any(Function),
      ),
    );
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

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOWNLOAD_IMAGES',
          images: expect.arrayContaining([expect.objectContaining({ src: 'b.jpg' })]),
        }),
      ),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_ZIP' }), expect.any(Function),
    );
    expect(await screen.findByText(/couldn't be fetched/i)).toBeInTheDocument();
  });

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

  it('shift-click selects the whole range between two checkboxes', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' }), image({ src: 'c.jpg' })]} />);
    await screen.findByText('Filters');

    const boxes = () => screen.getAllByRole('checkbox', { name: /select item|deselect item/i });
    fireEvent.click(boxes()[0]);
    fireEvent.click(boxes()[2], { shiftKey: true });

    expect(await screen.findByRole('button', { name: /download selected 3/i })).toBeInTheDocument();
  });

  it('shift-click range excludes a pending image caught in the middle of the run', async () => {
    const pendingImage = image({
      src: 'https://x.com/u/status/1/photo/1', kind: 'image',
      unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), pendingImage, image({ src: 'c.jpg' })]} />);
    await screen.findByText('Filters');

    const boxes = () => screen.getAllByRole('checkbox', { name: /select item|deselect item/i });
    expect(boxes()).toHaveLength(2);
    fireEvent.click(boxes()[0]);
    fireEvent.click(boxes()[1], { shiftKey: true });

    expect(await screen.findByRole('button', { name: /download selected 2/i })).toBeInTheDocument();
  });

  it('zips only the ticked set when a selection is active', async () => {
    (buildZip as Mock).mockResolvedValue({ bytes: new Uint8Array([1]), ok: 1, failed: [], results: [] });
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'DOWNLOAD_ZIP' && cb) cb({ status: 'success', message: 'Saved ZIP archive.' });
    });
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);
    await screen.findByRole('button', { name: /download selected 1/i });
    await openMenuAndChoose(/as zip archive/i);

    await waitFor(() => expect(buildZip).toHaveBeenCalled());
    expect(buildZip).toHaveBeenCalledWith(
      [expect.objectContaining({ src: 'a.jpg' })],
      expect.anything(), expect.anything(), expect.anything(),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_ZIP' }), expect.any(Function),
    );
  });

  it('toggles a favourite on (ADD_FAVOURITE) and back off (REMOVE_FAVOURITE)', async () => {
    render(<App collect={async () => [image({ src: 'fav.jpg' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getByRole('button', { name: /add favourite/i }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ADD_FAVOURITE', entry: expect.objectContaining({ src: 'fav.jpg', kind: 'image' }) }),
      ),
    );
    const removeBtn = await screen.findByRole('button', { name: /remove favourite/i });
    expect(screen.getByLabelText('Favourited')).toBeInTheDocument();

    await userEvent.click(removeBtn);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REMOVE_FAVOURITE', src: 'fav.jpg' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /add favourite/i })).toBeInTheDocument();
  });

  it('footer shows the shown/total counts and switches to a selected/Clear affordance', async () => {
    const { container } = render(
      <App collect={async () => [image({ src: 'a.jpg', type: 'jpeg' }), image({ src: 'b.png', type: 'png' })]} />,
    );
    await screen.findByText('Filters');
    const footerText = () => container.querySelector('footer')?.textContent ?? '';

    await waitFor(() => expect(footerText()).toMatch(/2\s*\/\s*2/));

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'jpeg' } });
    await waitFor(() => expect(footerText()).toMatch(/1\s*\/\s*2\s*shown/));

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

    expect(await screen.findByText('Downloaded 1 file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
  });

  it('surfaces a deep scan failure as a status message', async () => {
    (deepScanActiveTab as Mock).mockRejectedValueOnce(new Error('scan crashed'));
    render(<App collect={async () => [image({ src: 'a.jpg' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /deep scan/i }));

    expect(await screen.findByText('scan crashed')).toBeInTheDocument();
  });

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

  it('re-checks downloaded-on-disk when history changes, revealing the Downloaded badge', async () => {
    let disk: string[] = [];
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg, cb) => {
      if (msg?.type === 'GET_DOWNLOADED_SRCS' && cb) cb(disk);
    });
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;

    render(<App collect={async () => [image({ src: 'https://c/a.jpg' })]} />);
    await screen.findByText('Filters');
    expect(screen.queryByLabelText('Downloaded')).toBeNull();

    disk = ['https://c/a.jpg'];
    const fireAll = (change: Record<string, unknown>) =>
      addListener.mock.calls.slice(before).forEach(([fn]) => fn(change, 'local'));
    await act(async () => {
      fireAll({ [HISTORY_KEY]: { newValue: [] } });
      await Promise.resolve();
    });

    expect(await screen.findByLabelText('Downloaded')).toBeInTheDocument();
  });

  it('re-derives the filtered grid live when a download completes while the Downloaded filter is active', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Downloaded' }));

    expect(screen.queryByAltText('photo-a')).toBeNull();
    expect(screen.queryByAltText('photo-b')).toBeNull();

    disk = ['https://c/a.jpg'];
    const fireAll = (change: Record<string, unknown>) =>
      addListener.mock.calls.slice(before).forEach(([fn]) => fn(change, 'local'));
    await act(async () => {
      fireAll({ [HISTORY_KEY]: { newValue: [] } });
      await Promise.resolve();
    });

    expect(await screen.findByAltText('photo-a')).toBeInTheDocument();
    expect(screen.queryByAltText('photo-b')).toBeNull();
  });

  it('reflects a favourite added elsewhere via a storage change (badge appears)', async () => {
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;

    render(<App collect={async () => [image({ src: 'https://c/fav.jpg' })]} />);
    await screen.findByText('Filters');
    expect(screen.queryByLabelText('Favourited')).toBeNull();

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

  it('opens and closes the Excluded sources panel from the header', async () => {
    render(<App collect={async () => []} />);
    await userEvent.click(await screen.findByRole('button', { name: /excluded sources/i }));
    expect(await screen.findByRole('dialog', { name: 'Excluded sources' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluded sources' })).toBeNull());
  });

  it('opens and closes the Download history panel from the header', async () => {
    render(<App collect={async () => []} />);
    await userEvent.click(await screen.findByRole('button', { name: /download history/i }));
    expect(await screen.findByRole('dialog', { name: 'Download History' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Download History' })).toBeNull());
  });

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

  it('drives the ZIP builder with a working fetch and a live progress relay', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    (buildZip as Mock).mockImplementation(async (_imgs, _s, _url, opts) => {
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

  it('drops a ticked item from the selection when a filter hides it', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg', type: 'jpeg' }), image({ src: 'b.png', type: 'png' })]} />);
    await screen.findByText('Filters');

    await userEvent.click(screen.getAllByRole('checkbox', { name: /select item/i })[0]);
    expect(await screen.findByRole('button', { name: /download selected 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'png' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull());
    expect(screen.getByRole('button', { name: /^download 1$/i })).toBeInTheDocument();
  });

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

  it('relays HLS capture progress into the footer while the stream is captured', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { captureHlsStreams: true } }));
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

    await waitFor(() => expect(runId).toBeDefined());
    const onMessageCalls = (chrome.runtime.onMessage.addListener as Mock).mock.calls;
    const progressListener = onMessageCalls[onMessageCalls.length - 1][0];

    await act(async () => progressListener({ type: 'CAPTURE_PROGRESS', runId, done: 3, total: 8 }));
    const bar = await screen.findByRole('progressbar', { name: 'Capturing stream' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '8');

    await act(async () => captureCb!({ status: 'Captured clip.mp4 — 8 segments.' }));
    expect(await screen.findByText(/Captured clip\.mp4 — 8 segments/)).toBeInTheDocument();
  });

  it('treats a non-array collection result as an empty page', async () => {
    render(<App collect={async () => null as unknown as ImageInfo[]} />);
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

  it('ignores storage changes for the wrong area or key', async () => {
    const addListener = chrome.storage.onChanged.addListener as Mock;
    const before = addListener.mock.calls.length;
    render(<App collect={async () => [image({ src: 'https://c/a.jpg' })]} />);
    await screen.findByText('Filters');
    const [downloaded, fav, excluded] = [before, before + 1, before + 2].map((i) => addListener.mock.calls[i][0]);

    await act(async () => {
      downloaded({ [HISTORY_KEY]: {} }, 'sync');
      downloaded({ other: {} }, 'local');
      fav({ [FAVOURITES_KEY]: { newValue: [{ src: 'https://c/other.jpg' }] } }, 'sync');
      excluded({ [EXCLUDED_KEY]: {} }, 'sync');
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('Favourited')).toBeNull();
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
  });

  it('leaves a video pending (not failed) when it resolves to an HLS stream but capture is off', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { resolveOriginals: false, captureHlsStreams: false } }));
    (requestResolveOriginals as Mock).mockResolvedValueOnce({ 'poster.jpg': { url: 'https://x/s.m3u8', hls: true } });

    render(<App collect={async () => [pendingVideo]} />);
    fireEvent.click(await screen.findByTitle('Get video'));
    await waitFor(() => expect(requestResolveOriginals).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByText('not fetched')).toBeInTheDocument());
    expect(screen.queryByText(/couldn't fetch/i)).toBeNull();
  });

  it('unticks an item on a second click, and the header checkbox clears a full selection', async () => {
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');
    const firstTile = () => screen.getAllByRole('checkbox', { name: /select item|deselect item/i })[0];

    await userEvent.click(firstTile());
    expect(await screen.findByRole('button', { name: /download selected 1/i })).toBeInTheDocument();
    await userEvent.click(firstTile());
    await waitFor(() => expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull());

    await userEvent.click(screen.getByRole('checkbox', { name: /select all shown/i }));
    expect(await screen.findByRole('button', { name: /download selected 2/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /clear selection/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull());
  });

  it('uses the current page URL as the download source in the bubble surface', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) => {
      if (cb) cb({ status: 'success', message: 'Downloaded 1 file.' });
    });
    render(<App surface="bubble" collect={async () => [image({ src: 'a.jpg' })]} />);
    await screen.findByText('Filters');

    (chrome.tabs.query as Mock).mockClear();
    fireEvent.click(screen.getByRole('button', { name: /download 1/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES', sourcePage: expect.objectContaining({ url: expect.any(String) }) }),
        expect.any(Function),
      ),
    );
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  it('falls back to "unknown error" when a download error carries no message', async () => {
    (chrome.runtime.sendMessage as Mock).mockImplementation((_m, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = {};
      cb(undefined);
      (chrome.runtime as { lastError?: unknown }).lastError = undefined;
    });
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /download 1/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/error: unknown error/i));
  });

  it('flags only the videos that fail during a batch "Get all videos"', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: false } }));
    const resolveMock = requestResolveOriginals as Mock;
    resolveMock.mockResolvedValueOnce({ 'poster1.jpg': { url: 'https://video.twimg.com/a.mp4' } });

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

    await waitFor(() => expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument());
    expect(await screen.findByText(/couldn't fetch/i)).toBeInTheDocument();
  });

  it('downloads the original when the source fetch is not ok during conversion', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { convertImagesTo: 'png' } }));
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'https://cdn.example.com/x.jpg', type: 'jpeg', kind: 'image' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(await screen.findByRole('button', { name: /download 1/i }));

    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOWNLOAD_IMAGES', images: expect.arrayContaining([expect.objectContaining({ src: 'https://cdn.example.com/x.jpg' })]) }),
      ),
    );
    expect(convertImage).not.toHaveBeenCalled();
    expect(await screen.findByText(/couldn't convert/i)).toBeInTheDocument();
  });

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

  it('enriches only the remote image lacking a size, leaving the known one intact', async () => {
    global.fetch = vi.fn().mockResolvedValue({ headers: { get: () => '4096' } }) as unknown as typeof fetch;
    render(<App collect={async () => [image({ src: 'known.jpg', fileSize: 1024 }), image({ src: 'https://cdn.example.com/remote.jpg', fileSize: 0 })]} />);
    await screen.findByText('Filters');

    expect(await screen.findByText('4 KB')).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
  });
});

describe('smartPageDefaults (page-type-seeded filters)', () => {
  beforeEach(() => {
    (getPageType as Mock).mockReset();
  });

  it('seeds Sort/Size from the classified page type when smartPageDefaults is on', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { smartPageDefaults: true } }));
    (getPageType as Mock).mockResolvedValue('gallery');

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
    expect(screen.getByLabelText('Sort order')).toHaveValue('size');
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument();
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
