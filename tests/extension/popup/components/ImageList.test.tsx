import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImageList from '@/extension/popup/components/ImageList';
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
});