import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/extension/popup/App';
import { ImageInfo } from '@/types';
import { deepScanActiveTab } from '@/extension/shared/deep-scan-active-tab';
import { requestResolveOriginals } from '@/extension/shared/resolve-originals-active';

jest.mock('@/extension/shared/deep-scan-active-tab', () => ({
  deepScanActiveTab: jest.fn(async (onProgress) => {
    onProgress({ type: 'DEEP_SCAN_PROGRESS', found: 2, scrolls: 1, elapsedMs: 100 });
    return [
      { src: 'https://cdn.com/a.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
      { src: 'https://cdn.com/deep.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
    ];
  }),
  abortDeepScanActiveTab: jest.fn(),
}));

jest.mock('@/extension/shared/resolve-originals-active', () => ({
  requestResolveOriginals: jest.fn(async () => ({ 'poster.jpg': 'https://video.twimg.com/hi.mp4' })),
}));

const image = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'test.jpg', alt: 'Test', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false, kind: 'image', ...over,
});

describe('App Component', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    (chrome.storage.sync.set as jest.Mock).mockClear();
    (chrome.runtime.sendMessage as jest.Mock).mockReset();
    global.fetch = jest.fn().mockRejectedValue(new Error('no')) as unknown as typeof fetch;
  });

  it('renders the brand header', () => {
    render(<App collect={async () => []} />);
    expect(screen.getByText('Media Bulk Downloads')).toBeInTheDocument();
  });

  it('shows the scanning state initially', () => {
    render(<App collect={() => new Promise(() => {})} />);
    expect(screen.getByText('scanning this page')).toBeInTheDocument();
  });

  it('shows filters and a download button once images load', async () => {
    render(<App collect={async () => [image({})]} />);
    await screen.findByText('Filters');
    expect(screen.getByRole('button', { name: /download 1/i })).toBeInTheDocument();
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
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_m, cb) =>
      cb({ status: 'success', message: 'Downloading 2 files...' }),
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
    expect(await screen.findByText('Downloading 2 files...')).toBeInTheDocument();
  });

  it('disables download when a type filter matches nothing', async () => {
    render(<App collect={async () => [image({ type: 'png' })]} />);
    await screen.findByText('Filters');

    fireEvent.change(screen.getByLabelText('Media format'), { target: { value: 'jpeg' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^download$/i })).toBeDisabled(),
    );
  });

  it('lazily enriches remote image sizes after load', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      headers: { get: () => '2048' },
    }) as unknown as typeof fetch;

    render(<App collect={async () => [image({ src: 'remote.jpg', fileSize: 0 })]} />);
    await screen.findByText('Filters');

    // Card meta shows the enriched size.
    expect(await screen.findByText('2 KB')).toBeInTheDocument();
  });

  it('reports a download error from the background', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_m, cb) => {
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
    fireEvent.click(screen.getByRole('switch', { name: /show image count/i }));
    fireEvent.click(screen.getByText('Save'));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      settings: expect.objectContaining({ showImageCount: false }),
    });
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
    fireEvent.change(screen.getByLabelText(/minimum image size/i), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(headerCount()).toBe('4'));
  });

  it('drops unresolved Twitter videos when resolveOriginals is off', async () => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: false } }));

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

    // Only the normal image survives — the unresolved video is dropped.
    await waitFor(() => expect(headerCount()).toBe('1'));
    expect(requestResolveOriginals).not.toHaveBeenCalled();
  });

  it('includes the source page in the download message', async () => {
    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ url: 'https://page', title: 'Pg' }]);
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_m, cb) =>
      cb({ status: 'success', message: 'Downloading 1 file...' }),
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
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: true } }));

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

  it('a video that fails to resolve never appears and does not wipe the other items', async () => {
    // Regression: pending videos must not flicker in and then be dropped when
    // resolution returns nothing — they should simply never show, leaving the
    // rest of the grid intact.
    const resolveMock = requestResolveOriginals as jest.Mock;
    resolveMock.mockResolvedValue({}); // nothing resolves for this test
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { resolveOriginals: true } }));

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
    // The image shows and stays shown; the unresolved video never appears.
    await waitFor(() => expect(headerCount()).toBe('1'));
    await new Promise((r) => setTimeout(r, 30)); // let any late setState land
    expect(headerCount()).toBe('1'); // no override to 0
    expect(container.querySelector('video')).toBeNull();

    resolveMock.mockResolvedValue({ 'poster.jpg': 'https://video.twimg.com/hi.mp4' }); // restore default
  });
});
