import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    render(<ImageList images={media} onImageDownload={() => {}} downloadedSrcs={new Set(['https://c/a.jpg'])} />);
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
          onToggleFavourite={onToggleFavourite} favouriteSrcs={new Set()} />,
      );
      await userEvent.click(screen.getByRole('button', { name: /add favourite/i }));
      expect(onToggleFavourite).toHaveBeenCalledWith(favImg);
    });

    it('shows the favourited badge and a filled toggle when saved', () => {
      render(
        <ImageList images={[favImg]} onImageDownload={() => {}}
          onToggleFavourite={() => {}} favouriteSrcs={new Set([favImg.src])} />,
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