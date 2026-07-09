import type { Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/extension/popup/App';
import { ImageInfo } from '@/types';

const image = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'test.jpg', alt: 'Test', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false, kind: 'image', ...over,
});

describe('App — Facebook original-capture control', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
  });

  it('hides the control when no captureOriginals prop is given, even with the toggle on', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    render(<App collect={async () => []} />);
    await screen.findByText('No media here');
    expect(screen.queryByRole('button', { name: /full-res originals/i })).toBeNull();
  });

  it('hides the control when the prop is present but the toggle is off (default)', async () => {
    const captureOriginals = vi.fn(async () => []) as never;
    render(<App collect={async () => []} captureOriginals={captureOriginals} />);
    await screen.findByText('No media here');
    expect(screen.queryByRole('button', { name: /full-res originals/i })).toBeNull();
  });

  it('shows the control when the prop is present and the toggle is on, and gates on a confirm', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    const captureOriginals = vi.fn(async (onProgress: (p: unknown) => void) => {
      onProgress({ type: 'FB_CAPTURE_PROGRESS', opened: 1, captured: 1, total: 1 });
      return [image({ src: 'https://x.fbcdn.net/o_n.jpg' })];
    }) as never;
    render(<App collect={async () => []} captureOriginals={captureOriginals} />);

    const btn = await screen.findByRole('button', { name: /full-res originals/i });
    fireEvent.click(btn);

    // Confirm gate appears; capture not yet started.
    expect(screen.getByRole('dialog', { name: /confirm original capture/i })).toBeInTheDocument();
    expect(captureOriginals).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));

    await waitFor(() => expect(captureOriginals).toHaveBeenCalled());
    // The confirm gate dismisses once the run starts.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /confirm original capture/i })).toBeNull());
  });

  it('Cancel dismisses the confirm gate without running capture', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    const captureOriginals = vi.fn(async () => []) as never;
    render(<App collect={async () => []} captureOriginals={captureOriginals} />);

    fireEvent.click(await screen.findByRole('button', { name: /full-res originals/i }));
    expect(screen.getByRole('dialog', { name: /confirm original capture/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog', { name: /confirm original capture/i })).toBeNull();
    expect(captureOriginals).not.toHaveBeenCalled();
  });

  it('merges captured originals into the collection by canonical src key', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    const captureOriginals = vi.fn(async () => [
      image({ src: 'https://cdn.com/new.jpg' }),
    ]) as never;
    const { container } = render(
      <App collect={async () => [image({ src: 'https://cdn.com/a.jpg' })]} captureOriginals={captureOriginals} />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(await screen.findByRole('button', { name: /full-res originals/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));

    await waitFor(() => expect(headerCount()).toBe('2'));
  });
});
