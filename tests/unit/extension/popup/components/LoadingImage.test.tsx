import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoadingImage } from '@/extension/popup/components/LoadingImage';

describe('LoadingImage', () => {
  it('shows a shimmer skeleton and a hidden image until it decodes', () => {
    render(<LoadingImage src="a.jpg" alt="A" className="thumb" lazy />);
    const img = screen.getByAltText('A');
    expect(img).toHaveAttribute('src', 'a.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
    // Not yet loaded: skeleton present, image faded out.
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
    expect(img).toHaveClass('opacity-0');
  });

  it('clears the skeleton and reveals the image on successful load', () => {
    render(<LoadingImage src="a.jpg" alt="A" className="thumb" />);
    const img = screen.getByAltText('A');
    fireEvent.load(img);
    expect(document.querySelector('.skeleton')).not.toBeInTheDocument();
    expect(img).toHaveClass('opacity-100');
    expect(img).not.toHaveClass('opacity-0');
  });

  it('also clears the skeleton on error so a broken image does not shimmer forever', () => {
    render(<LoadingImage src="broken" alt="B" className="thumb" />);
    const img = screen.getByAltText('B');
    fireEvent.error(img);
    expect(document.querySelector('.skeleton')).not.toBeInTheDocument();
    expect(img).toHaveClass('opacity-100');
  });

  it('omits the lazy loading attribute when not requested', () => {
    render(<LoadingImage src="a.jpg" alt="C" className="thumb" />);
    expect(screen.getByAltText('C')).not.toHaveAttribute('loading');
  });
});
