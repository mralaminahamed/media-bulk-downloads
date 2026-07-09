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

  it('replaces the collection with the captured snapshot — the upgraded photo does not duplicate the low-res tile', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    // captureOriginals resolves a COMPLETE fresh snapshot of the page (not a delta) —
    // here, the same photo upgraded to a different (full-res) CDN path.
    const captureOriginals = vi.fn(async () => [
      image({ src: 'https://x.fbcdn.net/hires/a_n.jpg' }),
    ]) as never;
    const { container } = render(
      <App collect={async () => [image({ src: 'https://x.fbcdn.net/lowres/a_n.jpg' })]} captureOriginals={captureOriginals} />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(await screen.findByRole('button', { name: /full-res originals/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));

    // Still exactly one item — no duplicate row for the same photo.
    await waitFor(() => expect(headerCount()).toBe('1'));
    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', 'https://x.fbcdn.net/hires/a_n.jpg');
  });

  it('never wipes the collection on an empty/failed capture', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    const captureOriginals = vi.fn(async () => []) as never;
    const { container } = render(
      <App collect={async () => [image({ src: 'https://x.fbcdn.net/lowres/a_n.jpg' })]} captureOriginals={captureOriginals} />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(await screen.findByRole('button', { name: /full-res originals/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));

    await waitFor(() => expect(captureOriginals).toHaveBeenCalled());
    // Collection unchanged — still the original low-res item, not wiped.
    expect(headerCount()).toBe('1');
    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', 'https://x.fbcdn.net/lowres/a_n.jpg');
  });

  it('deep-scan-chain: replaces the collection with the fresh snapshot — no duplicate of the upgraded photo', async () => {
    // captureOriginals present (FB photo grid) + fbCaptureOriginals on ⇒ this deep
    // scan chained a capture, so its result is a COMPLETE upgraded snapshot (same
    // photo, different fbcdn pathname ⇒ different canonical key than the stale tile).
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    const captureOriginals = vi.fn(async () => []) as never;
    const deepScan = vi.fn(async () => [
      image({ src: 'https://x.fbcdn.net/hires/a_n.jpg' }),
    ]) as never;
    const { container } = render(
      <App
        collect={async () => [image({ src: 'https://x.fbcdn.net/lowres/a_n.jpg' })]}
        captureOriginals={captureOriginals}
        deepScan={deepScan}
      />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(await screen.findByRole('button', { name: /deep scan/i }));

    // Exactly one item — the stale low-res row was replaced, not kept alongside
    // the upgraded one.
    await waitFor(() => expect(deepScan).toHaveBeenCalled());
    await waitFor(() => expect(headerCount()).toBe('1'));
    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', 'https://x.fbcdn.net/hires/a_n.jpg');
  });

  it('normal deep scan (not a capture chain) still additively merges new media', async () => {
    // No captureOriginals prop ⇒ not a FB photo grid ⇒ shouldChainCapture is false,
    // regardless of the fbCaptureOriginals toggle — the additive merge must hold.
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: true } }));
    const deepScan = vi.fn(async () => [
      image({ src: 'https://cdn.example.com/new-tile.jpg' }),
    ]) as never;
    const { container } = render(
      <App collect={async () => [image({ src: 'https://cdn.example.com/existing.jpg' })]} deepScan={deepScan} />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(await screen.findByRole('button', { name: /deep scan/i }));

    // Both the prior item and the newly found one are present — additive merge preserved.
    await waitFor(() => expect(headerCount()).toBe('2'));
    const srcs = screen.getAllByRole('img', { name: 'Test' }).map((el) => el.getAttribute('src'));
    expect(srcs).toEqual(expect.arrayContaining(['https://cdn.example.com/existing.jpg', 'https://cdn.example.com/new-tile.jpg']));
  });

  it('deep scan with fbCaptureOriginals off still additively merges, even with the capture prop present', async () => {
    // captureOriginals present, but the master toggle is off ⇒ shouldChainCapture
    // is false ⇒ the deep scan did not chain a capture ⇒ additive merge must hold.
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { fbCaptureOriginals: false } }));
    const captureOriginals = vi.fn(async () => []) as never;
    const deepScan = vi.fn(async () => [
      image({ src: 'https://cdn.example.com/new-tile.jpg' }),
    ]) as never;
    const { container } = render(
      <App
        collect={async () => [image({ src: 'https://cdn.example.com/existing.jpg' })]}
        captureOriginals={captureOriginals}
        deepScan={deepScan}
      />,
    );
    await screen.findByText('Filters');
    const headerCount = () => container.querySelector('header .num')?.textContent;
    expect(headerCount()).toBe('1');

    fireEvent.click(await screen.findByRole('button', { name: /deep scan/i }));

    await waitFor(() => expect(headerCount()).toBe('2'));
  });
});
