import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import BrandMark from '@/extension/components/BrandMark';

describe('BrandMark', () => {
  it('renders the brand artwork with a default accessible label and 28px size', () => {
    const svg = render(<BrandMark />).container.querySelector('svg');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Media Bulk Downloads');
    expect(svg).toHaveAttribute('width', '28');
    expect(svg).toHaveAttribute('height', '28');
  });

  it('honours a custom size, title, and className', () => {
    const svg = render(<BrandMark size={40} title="Downloader" className="mark" />).container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
    expect(screen.getByRole('img', { name: 'Downloader' })).toBe(svg);
    expect(svg).toHaveClass('mark');
  });
});
