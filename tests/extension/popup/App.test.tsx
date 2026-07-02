import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '@/extension/popup/App';
import { ImageInfo } from '@/types';

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Image Bulk Downloads')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<App />);
    expect(screen.getByText('Getting images...')).toBeInTheDocument();
  });

  it('displays the filter toolbar and download button when images load', async () => {
    const mockImages: ImageInfo[] = [
      { src: 'test.jpg', alt: 'Test Image', width: 100, height: 100, type: 'jpeg', fileSize: 1024, isBase64: false },
    ];

    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ id: 1 }]);
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((..._args: unknown[]) => {
      const cb = _args[2] as (images: ImageInfo[]) => void;
      cb(mockImages);
    });

    render(<App />);

    await screen.findByText('Filter Images');
    expect(screen.getByText('Download Images')).toBeInTheDocument();
  });
});
