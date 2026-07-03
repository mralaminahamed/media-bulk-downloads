import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/extension/popup/App';
import { ImageInfo } from '@/types';
import { deepScanActiveTab } from '@/extension/shared/deep-scan-active-tab';

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

  it('surfaces a collection error', async () => {
    render(<App collect={async () => { throw new Error('content script missing'); }} />);
    expect(await screen.findByText(/can't read this page: content script missing/i)).toBeInTheDocument();
  });

  it('sends a bulk download request and reflects the response', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_m, cb) =>
      cb({ status: 'success', message: 'Downloading 2 files...' }),
    );
    render(<App collect={async () => [image({ src: 'a.jpg' }), image({ src: 'b.jpg' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: /download 2/i }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOWNLOAD_IMAGES' }),
      expect.any(Function),
    );
    expect(await screen.findByText('Downloading 2 files...')).toBeInTheDocument();
  });

  it('disables download when a type filter matches nothing', async () => {
    render(<App collect={async () => [image({ type: 'png' })]} />);
    await screen.findByText('Filters');

    fireEvent.click(screen.getByRole('button', { name: 'JPEG' }));

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
});
