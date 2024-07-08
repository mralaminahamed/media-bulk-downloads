import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '@/extension/popup/App';

describe('App Component', () => {
    it('renders without crashing', () => {
      render(<App />);
      expect(screen.getByText('Image Bulk Downloads')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      render(<App />);
      expect(screen.getByText('Getting images...')).toBeInTheDocument();
    });

    it('displays filter toolbar when images are loaded', async () => {
      const mockImages = [{ src: 'test.jpg', alt: 'Test Image', width: 100, height: 100, type: 'jpeg', fileSize: 1024 }];
        jest.spyOn(global.chrome.tabs, 'query').mockImplementation(
            () => Promise.resolve([{ id: 1 }] as chrome.tabs.Tab[])
        );

        jest.spyOn(global.chrome.tabs, 'sendMessage').mockImplementation(
            () => Promise.resolve(mockImages)
        );


        render(<App />);

      // Wait for images to load
      await screen.findByText('Filter Images');

      expect(screen.getByText('Download All')).toBeInTheDocument();
    });
  });

