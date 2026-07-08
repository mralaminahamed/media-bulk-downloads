import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SrcKeySet } from '@/extension/shared/collection/canonical';
import '@testing-library/jest-dom';
import ImageList, { formatFileSize } from '@/extension/popup/components/ImageList';
import { ImageInfo } from '@/types';

const mockImages: ImageInfo[] = [
  { src: 'test1.jpg', alt: 'Test Image 1', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false, kind: 'image' },
  { src: 'test2.png', alt: 'Test Image 2', width: 200, height: 200, type: 'png', fileSize: 2048, isBase64: false, kind: 'image' },
];

describe('ImageList Component', () => {
  it('renders images correctly', () => {
    render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByAltText('Test Image 1')).toBeInTheDocument();
    expect(screen.getByAltText('Test Image 2')).toBeInTheDocument();
  });

  it('calls onImageDownload when download button is clicked', () => {
    const mockDownload = jest.fn();
    render(<ImageList images={mockImages} onImageDownload={mockDownload} />);
    const downloadButtons = screen.getAllByTitle('Download');
    fireEvent.click(downloadButtons[0]);
    expect(mockDownload).toHaveBeenCalledWith(mockImages[0]);
  });

  it('opens image details modal when view button is clicked', () => {
    render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
    const viewButtons = screen.getAllByTitle('View Details');
    fireEvent.click(viewButtons[0]);
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('downloads from within the preview modal', () => {
    const onDownload = jest.fn();
    render(<ImageList images={mockImages} onImageDownload={onDownload} />);
    fireEvent.click(screen.getAllByTitle('View Details')[0]);
    // The modal's download button is the only one with visible text.
    fireEvent.click(screen.getByText('Download'));
    expect(onDownload).toHaveBeenCalledWith(mockImages[0]);
  });

  it('drives a pending video from the preview modal — Get video, then a Fetching… spinner', () => {
    const pending: ImageInfo = {
      src: 'poster.jpg', alt: 'v', width: 0, height: 0, type: 'mp4', fileSize: 0, isBase64: false,
      kind: 'video', unresolvedVideo: true, poster: 'poster.jpg', resolveHint: { platform: 'twitter', id: '9' },
    };
    const onFetchVideo = jest.fn();
    const { rerender } = render(<ImageList images={[pending]} onImageDownload={jest.fn()} onFetchVideo={onFetchVideo} />);
    fireEvent.click(screen.getByTitle('View Details'));

    // Idle: the modal offers "Get video" and wires the per-item fetch.
    fireEvent.click(screen.getByText('Get video'));
    expect(onFetchVideo).toHaveBeenCalledWith(pending);

    // In flight (e.g. during a bulk "Get all videos"): the modal shows Fetching….
    rerender(
      <ImageList images={[pending]} onImageDownload={jest.fn()} onFetchVideo={onFetchVideo} fetchingSrcs={new Set(['poster.jpg'])} />,
    );
    expect(screen.getByText('Fetching…')).toBeInTheDocument();
    expect(screen.queryByText('Get video')).not.toBeInTheDocument();
  });

  it('labels a pending Instagram reel "play to fetch", not "can\'t fetch"', () => {
    const reel: ImageInfo = {
      src: 'https://scontent-del2-3.cdninstagram.com/RL_cover_n.jpg', alt: '', width: 640, height: 1136,
      type: 'mp4', fileSize: 0, isBase64: false, kind: 'video', unresolvedVideo: true,
      poster: 'https://scontent-del2-3.cdninstagram.com/RL_cover_n.jpg',
    };
    render(<ImageList images={[reel]} onImageDownload={jest.fn()} />);
    expect(screen.getByText('play to fetch')).toBeInTheDocument();
    expect(screen.queryByText("can't fetch")).not.toBeInTheDocument();
    // No download / Get-video button on a pending reel (no resolveHint).
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Get video')).not.toBeInTheDocument();
  });

  it('still labels a non-Instagram pending video with no resolve path "can\'t fetch"', () => {
    const gif: ImageInfo = {
      src: 'https://pbs.twimg.com/x.jpg', alt: '', width: 0, height: 0, type: 'mp4', fileSize: 0,
      isBase64: false, kind: 'video', unresolvedVideo: true, poster: 'https://pbs.twimg.com/x.jpg',
    };
    render(<ImageList images={[gif]} onImageDownload={jest.fn()} />);
    expect(screen.getByText("can't fetch")).toBeInTheDocument();
    expect(screen.queryByText('play to fetch')).not.toBeInTheDocument();
  });

  it('closes the preview modal', () => {
    render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
    fireEvent.click(screen.getAllByTitle('View Details')[0]);
    expect(screen.getByText('Preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('opens the preview as a labelled modal dialog and closes it on Escape', async () => {
    render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
    await userEvent.click(screen.getAllByTitle('View Details')[0]);
    expect(screen.getByRole('dialog', { name: /preview/i })).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders empty grid without crashing', () => {
    render(<ImageList images={[]} onImageDownload={jest.fn()} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('renders a video tile with a poster and a player in the preview', async () => {
    const media = [{
      src: 'https://ex.com/v.mp4', alt: 'Clip', width: 0, height: 0,
      type: 'mp4', fileSize: 0, isBase64: false, kind: 'video' as const,
      poster: 'https://ex.com/p.jpg',
    }];
    render(<ImageList images={media} onImageDownload={() => {}} />);
    // poster used as the tile image
    expect(screen.getByRole('img', { name: 'Clip' })).toHaveAttribute('src', 'https://ex.com/p.jpg');
    // open preview → <video> present
    await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
    expect(document.querySelector('video')).toBeTruthy();
  });

  it('renders an audio tile as an icon and an <audio> player in preview', async () => {
    const media = [{
      src: 'https://ex.com/s.mp3', alt: '', width: 0, height: 0,
      type: 'mp3', fileSize: 0, isBase64: false, kind: 'audio' as const,
    }];
    render(<ImageList images={media} onImageDownload={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
    expect(document.querySelector('audio')).toBeTruthy();
  });

  it('shows a downloaded badge only on tiles whose src is downloaded', () => {
    const media = [
      { src: 'https://c/a.jpg', alt: 'A', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const },
      { src: 'https://c/b.jpg', alt: 'B', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const },
    ];
    render(<ImageList images={media} onImageDownload={() => {}} downloadedSrcs={SrcKeySet.from(['https://c/a.jpg'])} />);
    expect(screen.getAllByLabelText('Downloaded')).toHaveLength(1);
  });

  describe('ImageList — favourites', () => {
    const favImg: ImageInfo = {
      src: 'https://c/a.jpg', alt: 'a', width: 10, height: 10,
      type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image',
    };

    it('renders a favourite toggle and calls onToggleFavourite', async () => {
      const onToggleFavourite = jest.fn();
      render(
        <ImageList images={[favImg]} onImageDownload={() => {}}
          onToggleFavourite={onToggleFavourite} favouriteSrcs={new SrcKeySet()} />,
      );
      await userEvent.click(screen.getByRole('button', { name: /add favourite/i }));
      expect(onToggleFavourite).toHaveBeenCalledWith(favImg);
    });

    it('shows the favourited badge and a filled toggle when saved', () => {
      render(
        <ImageList images={[favImg]} onImageDownload={() => {}}
          onToggleFavourite={() => {}} favouriteSrcs={SrcKeySet.from([favImg.src])} />,
      );
      expect(screen.getByLabelText('Favourited')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove favourite/i })).toBeInTheDocument();
    });
  });

  describe('ImageList pending videos', () => {
    const pendingVideo: ImageInfo = {
      src: 'poster.jpg', alt: '', width: 0, height: 0, type: 'mp4', fileSize: 0, isBase64: false,
      kind: 'video', poster: 'poster.jpg', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' },
    };

    it('renders a Get video action and calls onFetchVideo; no plain Download button', () => {
      const onFetchVideo = jest.fn();
      render(<ImageList images={[pendingVideo]} onImageDownload={jest.fn()} onFetchVideo={onFetchVideo} />);
      fireEvent.click(screen.getByTitle('Get video'));
      expect(onFetchVideo).toHaveBeenCalledWith(pendingVideo);
      expect(screen.queryByTitle('Download')).toBeNull();
    });

    it('shows a failed state for a src in resolveFailedSrcs', () => {
      render(<ImageList images={[pendingVideo]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()} resolveFailedSrcs={new Set(['poster.jpg'])} />);
      expect(screen.getByText(/couldn't fetch/i)).toBeInTheDocument();
    });

    it('shows a can\'t-fetch state (no button) for a pending video with no resolveHint', () => {
      render(<ImageList images={[{ ...pendingVideo, resolveHint: undefined }]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()} />);
      expect(screen.queryByTitle('Get video')).toBeNull();
      expect(screen.getByText(/can't fetch/i)).toBeInTheDocument();
    });

    it('a resolved video (not pending) still shows a normal Download button', () => {
      const resolved: ImageInfo = { ...pendingVideo, src: 'https://video.twimg.com/hi.mp4', unresolvedVideo: false, resolveHint: undefined };
      render(<ImageList images={[resolved]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()} />);
      expect(screen.getByTitle('Download')).toBeInTheDocument();
    });
  });

  describe('ImageList — selection', () => {
    it('toggles a single item, then shift-clicks to select the range to it', () => {
      const onToggleSelect = jest.fn();
      const onSelectRange = jest.fn();
      render(
        <ImageList images={mockImages} onImageDownload={jest.fn()} onToggleSelect={onToggleSelect} onSelectRange={onSelectRange} />,
      );
      const boxes = screen.getAllByRole('checkbox');
      expect(boxes).toHaveLength(2);

      // Plain click sets the range anchor and toggles that one item.
      fireEvent.click(boxes[0]);
      expect(onToggleSelect).toHaveBeenCalledWith(mockImages[0]);

      // Shift-click extends from the anchor (0) to the clicked index (1).
      fireEvent.click(boxes[1], { shiftKey: true });
      expect(onSelectRange).toHaveBeenCalledWith(mockImages);
    });

    it('normalises a shift-click that runs upward from the anchor', () => {
      const onSelectRange = jest.fn();
      render(
        <ImageList images={mockImages} onImageDownload={jest.fn()} onToggleSelect={jest.fn()} onSelectRange={onSelectRange} />,
      );
      const boxes = screen.getAllByRole('checkbox');
      fireEvent.click(boxes[1]); // anchor = 1
      fireEvent.click(boxes[0], { shiftKey: true }); // anchor(1) > index(0) → [0, 1]
      expect(onSelectRange).toHaveBeenCalledWith(mockImages);
    });

    it('falls back to a single toggle when shift-clicking without a range handler', () => {
      const onToggleSelect = jest.fn();
      render(<ImageList images={mockImages} onImageDownload={jest.fn()} onToggleSelect={onToggleSelect} />);
      const boxes = screen.getAllByRole('checkbox');
      fireEvent.click(boxes[0]);
      fireEvent.click(boxes[1], { shiftKey: true });
      expect(onToggleSelect).toHaveBeenLastCalledWith(mockImages[1]);
    });
  });

  describe('ImageList — modal paging + favourite', () => {
    it('pages through images with the arrow keys inside the modal', () => {
      render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
      fireEvent.click(screen.getAllByTitle('View Details')[0]);
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('2 / 2')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      // Clamps at the ends — ArrowLeft on the first image is a no-op.
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('pages with the on-screen prev/next buttons', () => {
      render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
      fireEvent.click(screen.getAllByTitle('View Details')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('clamps arrow paging at the last image', () => {
      render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
      fireEvent.click(screen.getAllByTitle('View Details')[1]); // open on the last image
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'ArrowRight' }); // no-op past the end
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('toggles favourite from the modal header (add and remove labels)', () => {
      const onToggleFavourite = jest.fn();
      const { rerender } = render(
        <ImageList images={mockImages} onImageDownload={jest.fn()} onToggleFavourite={onToggleFavourite} favouriteSrcs={new SrcKeySet()} />,
      );
      fireEvent.click(screen.getAllByTitle('View Details')[0]);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /add favourite/i }));
      expect(onToggleFavourite).toHaveBeenCalledWith(mockImages[0]);

      // When already saved, the same header control reads "Remove favourite".
      rerender(
        <ImageList images={mockImages} onImageDownload={jest.fn()} onToggleFavourite={onToggleFavourite} favouriteSrcs={SrcKeySet.from([mockImages[0].src])} />,
      );
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: /remove favourite/i })).toBeInTheDocument();
    });
  });

  describe('ImageList — exclude menu', () => {
    const httpImg: ImageInfo = {
      src: 'https://cdn.example.com/a.jpg', alt: 'A', width: 10, height: 10,
      type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image',
    };

    const openMenu = (onExclude: jest.Mock): void => {
      render(<ImageList images={[httpImg]} onImageDownload={jest.fn()} onExclude={onExclude} />);
      fireEvent.click(screen.getByTitle('View Details'));
      fireEvent.click(screen.getByRole('button', { name: 'Exclude source' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    };

    it('excludes just this image (url scope) and closes the modal', () => {
      const onExclude = jest.fn();
      openMenu(onExclude);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Exclude this image' }));
      expect(onExclude).toHaveBeenCalledWith(httpImg, 'url');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('excludes the whole host and closes the modal', () => {
      const onExclude = jest.fn();
      openMenu(onExclude);
      // The host item is a two-line label: "Exclude host" + the host on a muted
      // second line, so the accessible name is "Exclude host cdn.example.com".
      const hostItem = screen.getByRole('menuitem', { name: /exclude host/i });
      expect(hostItem).toHaveTextContent('cdn.example.com');
      fireEvent.click(hostItem);
      expect(onExclude).toHaveBeenCalledWith(httpImg, 'host');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes the menu on an outside click, leaving the modal open', () => {
      openMenu(jest.fn());
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes only the exclude menu on Escape, keeping the modal open', () => {
      openMenu(jest.fn());
      // Escape is handled on a capture-phase document listener that stops
      // propagation, so the dialog's own Escape-to-close never fires.
      fireEvent.keyDown(screen.getByRole('button', { name: 'Exclude source' }), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('keeps the menu open on a non-Escape key', () => {
      openMenu(jest.fn());
      fireEvent.keyDown(screen.getByRole('button', { name: 'Exclude source' }), { key: 'a' });
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('omits the host option when the source has no parseable host', () => {
      render(<ImageList images={mockImages} onImageDownload={jest.fn()} onExclude={jest.fn()} />);
      fireEvent.click(screen.getAllByTitle('View Details')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Exclude source' }));
      expect(screen.getByRole('menuitem', { name: 'Exclude this image' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Exclude host/ })).not.toBeInTheDocument();
    });
  });

  describe('ImageList — tile labels & preview details', () => {
    it('labels a base64 tile "B64" and marks it Base64 with unknown dimensions in the preview', async () => {
      const b64: ImageInfo = {
        src: 'data:image/png;base64,iVBORw0K', alt: 'inline', width: 0, height: 0,
        type: 'png', fileSize: 0, isBase64: true, kind: 'image',
      };
      render(<ImageList images={[b64]} onImageDownload={jest.fn()} />);
      // Tile type tag reads B64 rather than the raw type.
      expect(screen.getByText('B64')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      const dialog = screen.getByRole('dialog');
      // 0×0 → "Unknown" dimensions; the Type row appends "· Base64".
      expect(within(dialog).getByText(/Unknown/)).toBeInTheDocument();
      expect(within(dialog).getByText(/·\s*Base64/)).toBeInTheDocument();
    });

    it('shows an em dash for a non-image item\'s dimensions in the preview details', async () => {
      const clip: ImageInfo = {
        src: 'https://ex.com/v.mp4', alt: '', width: 0, height: 0, type: 'mp4',
        fileSize: 4096, isBase64: false, kind: 'video', poster: 'https://ex.com/p.jpg',
      };
      render(<ImageList images={[clip]} onImageDownload={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      // Videos carry no pixel dimensions → the Size row leads with an em dash.
      expect(within(screen.getByRole('dialog')).getByText(/—\s*·\s*4 KB/)).toBeInTheDocument();
    });

    it('defaults the favourite toggle to unpressed when no favourites set is provided', async () => {
      // App always passes favouriteSrcs, but the prop is optional — the `?? false`
      // default must hold on both the grid tile and the modal header.
      render(<ImageList images={[mockImages[0]]} onImageDownload={jest.fn()} onToggleFavourite={jest.fn()} />);
      expect(screen.getByRole('button', { name: /add favourite/i })).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: /add favourite/i }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('closes the preview when the shown image is removed from the list underneath it', () => {
      const { rerender } = render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
      fireEvent.click(screen.getAllByTitle('View Details')[1]); // open on the last (index 1) image
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // The list shrinks to one item (the previewed one got excluded/filtered) →
      // images[1] is now undefined → selectedImage falls back to null → modal closes.
      rerender(<ImageList images={[mockImages[0]]} onImageDownload={jest.fn()} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('ImageList — pending video & HLS preview', () => {
    it('previews a pending video by its poster (no <video> — the file is not fetched yet)', async () => {
      const pending: ImageInfo = {
        src: 'poster.jpg', alt: 'clip', width: 0, height: 0, type: 'mp4', fileSize: 0,
        isBase64: false, kind: 'video', unresolvedVideo: true, poster: 'poster.jpg',
        resolveHint: { platform: 'twitter', id: '1' },
      };
      render(<ImageList images={[pending]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('img', { name: 'clip' })).toHaveAttribute('src', 'poster.jpg');
      expect(dialog.querySelector('video')).toBeNull();
    });

    it('handles a pending video with no poster and no resolve path (src fallback + can\'t-fetch)', async () => {
      // Non-Instagram src, no poster (exercises isIgUrl(undefined)), no resolveHint.
      const noPoster: ImageInfo = {
        src: 'https://pbs.twimg.com/x.jpg', alt: 'v', width: 0, height: 0, type: 'mp4',
        fileSize: 0, isBase64: false, kind: 'video', unresolvedVideo: true,
      };
      render(<ImageList images={[noPoster]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()} />);
      // Tile label resolves to "can't fetch" (not an IG reel, no resolve path).
      expect(screen.getByText("can't fetch")).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      const dialog = screen.getByRole('dialog');
      // With no poster the preview image falls back to the src…
      expect(within(dialog).getByRole('img', { name: 'v' })).toHaveAttribute('src', 'https://pbs.twimg.com/x.jpg');
      // …and the footer says the file can't be fetched, with no Get-video action.
      expect(within(dialog).getByText(/can't be fetched/i)).toBeInTheDocument();
      expect(within(dialog).queryByText('Get video')).toBeNull();
    });

    it('offers a retry label in the preview footer for a failed pending video', async () => {
      const pending: ImageInfo = {
        src: 'poster.jpg', alt: 'v', width: 0, height: 0, type: 'mp4', fileSize: 0,
        isBase64: false, kind: 'video', unresolvedVideo: true, poster: 'poster.jpg',
        resolveHint: { platform: 'twitter', id: '1' },
      };
      render(
        <ImageList images={[pending]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()}
          resolveFailedSrcs={new Set(['poster.jpg'])} />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      expect(within(screen.getByRole('dialog')).getByText(/Couldn't fetch — retry/i)).toBeInTheDocument();
    });

    it('tells the user to play an Instagram reel from the preview footer', async () => {
      const reel: ImageInfo = {
        src: 'https://scontent.cdninstagram.com/cover.jpg', alt: 'reel', width: 0, height: 0,
        type: 'mp4', fileSize: 0, isBase64: false, kind: 'video', unresolvedVideo: true,
        poster: 'https://scontent.cdninstagram.com/cover.jpg',
      };
      render(<ImageList images={[reel]} onImageDownload={jest.fn()} onFetchVideo={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      expect(within(screen.getByRole('dialog')).getByText(/Play this reel on Instagram/i)).toBeInTheDocument();
    });

    it('previews an HLS stream by its poster and offers Capture stream', async () => {
      const hls: ImageInfo = {
        src: 'https://x/master.m3u8', alt: 'stream', width: 0, height: 0, type: 'm3u8',
        fileSize: 0, isBase64: false, kind: 'video', hlsManifest: 'https://x/master.m3u8',
        poster: 'https://x/poster.jpg',
      };
      const onDownload = jest.fn();
      render(<ImageList images={[hls]} onImageDownload={onDownload} />);
      expect(screen.getByText(/HLS · capture/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      const dialog = screen.getByRole('dialog');
      // The poster stands in for the un-playable manifest.
      expect(within(dialog).getByRole('img', { name: 'stream' })).toHaveAttribute('src', 'https://x/poster.jpg');
      // The footer action reads "Capture stream", and routes to onImageDownload.
      fireEvent.click(within(dialog).getByRole('button', { name: 'Capture stream' }));
      expect(onDownload).toHaveBeenCalledWith(hls);
    });

    it('falls back to a film glyph when an HLS stream has no poster', async () => {
      const hls: ImageInfo = {
        src: 'https://x/master.m3u8', alt: '', width: 0, height: 0, type: 'm3u8', fileSize: 0,
        isBase64: false, kind: 'video', hlsManifest: 'https://x/master.m3u8',
      };
      render(<ImageList images={[hls]} onImageDownload={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'View Details' }));
      const dialog = screen.getByRole('dialog');
      // No poster → no preview <img>; a film glyph renders instead.
      expect(within(dialog).queryByRole('img')).toBeNull();
      expect(dialog.querySelector('svg')).toBeTruthy();
    });
  });

  describe('formatFileSize', () => {
    it('shows an em dash for unknown/invalid sizes', () => {
      expect(formatFileSize(0)).toBe('—');
      expect(formatFileSize(-5)).toBe('—');
      expect(formatFileSize(NaN)).toBe('—');
      expect(formatFileSize(Infinity)).toBe('—');
    });

    it('formats bytes, KB, MB, and TB with sensible precision', () => {
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1023)).toBe('1023 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1024 ** 4)).toBe('1 TB');
    });

    it('clamps beyond TB to the TB unit', () => {
      expect(formatFileSize(1024 ** 6)).toContain('TB');
    });
  });
});