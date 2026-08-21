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
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
    expect(img).toHaveClass('mbd:opacity-0');
  });

  it('clears the skeleton and reveals the image on successful load', () => {
    render(<LoadingImage src="a.jpg" alt="A" className="thumb" />);
    const img = screen.getByAltText('A');
    fireEvent.load(img);
    expect(document.querySelector('.skeleton')).not.toBeInTheDocument();
    expect(img).toHaveClass('mbd:opacity-100');
    expect(img).not.toHaveClass('mbd:opacity-0');
  });

  it('also clears the skeleton on error so a broken image does not shimmer forever', () => {
    render(<LoadingImage src="broken" alt="B" className="thumb" />);
    const img = screen.getByAltText('B');
    fireEvent.error(img);
    expect(document.querySelector('.skeleton')).not.toBeInTheDocument();
    expect(img).toHaveClass('mbd:opacity-100');
  });

  it('falls back to fallbackSrc when the primary src errors', () => {
    render(<LoadingImage src="primary.jpg" fallbackSrc="fallback.jpg" alt="F" className="thumb" />);
    const img = screen.getByAltText('F');
    expect(img).toHaveAttribute('src', 'primary.jpg');
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', 'fallback.jpg');
  });

  it('calls onFailed only after both the primary and the fallback error', () => {
    const onFailed = vi.fn();
    render(<LoadingImage src="primary.jpg" fallbackSrc="fallback.jpg" onFailed={onFailed} alt="G" className="thumb" />);
    const img = screen.getByAltText('G');
    fireEvent.error(img); // primary → switch to fallback
    expect(onFailed).not.toHaveBeenCalled();
    fireEvent.error(img); // fallback → give up
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('calls onFailed on the first error when there is no fallback', () => {
    const onFailed = vi.fn();
    render(<LoadingImage src="broken.jpg" onFailed={onFailed} alt="H" className="thumb" />);
    fireEvent.error(screen.getByAltText('H'));
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('omits the lazy loading attribute when not requested', () => {
    render(<LoadingImage src="a.jpg" alt="C" className="thumb" />);
    expect(screen.getByAltText('C')).not.toHaveAttribute('loading');
  });
});
