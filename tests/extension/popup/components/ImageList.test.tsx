import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImageList, { formatFileSize } from '@/extension/popup/components/ImageList';
import { ImageInfo } from '@/types';

const mockImages: ImageInfo[] = [
  { src: 'test1.jpg', alt: 'Test Image 1', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false },
  { src: 'test2.png', alt: 'Test Image 2', width: 200, height: 200, type: 'png', fileSize: 2048, isBase64: false },
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
    const downloadButtons = screen.getAllByTitle('Download Image');
    fireEvent.click(downloadButtons[0]);
    expect(mockDownload).toHaveBeenCalledWith(mockImages[0]);
  });

  it('opens image details modal when view button is clicked', () => {
    render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
    const viewButtons = screen.getAllByTitle('View Details');
    fireEvent.click(viewButtons[0]);
    expect(screen.getByText('Image Preview')).toBeInTheDocument();
  });

  it('downloads from within the preview modal', () => {
    const onDownload = jest.fn();
    render(<ImageList images={mockImages} onImageDownload={onDownload} />);
    fireEvent.click(screen.getAllByTitle('View Details')[0]);
    // The modal's download button is the only one with visible text.
    fireEvent.click(screen.getByText('Download Image'));
    expect(onDownload).toHaveBeenCalledWith(mockImages[0]);
  });

  it('closes the preview modal', () => {
    render(<ImageList images={mockImages} onImageDownload={jest.fn()} />);
    fireEvent.click(screen.getAllByTitle('View Details')[0]);
    expect(screen.getByText('Image Preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.queryByText('Image Preview')).not.toBeInTheDocument();
  });

  it('renders empty grid without crashing', () => {
    render(<ImageList images={[]} onImageDownload={jest.fn()} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
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