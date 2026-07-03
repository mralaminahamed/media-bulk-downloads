import React, { useEffect, useState } from 'react';
import { ImageInfo } from '@/types';
import {
  EyeIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface ImageListProps {
  images: ImageInfo[];
  onImageDownload: (image: ImageInfo) => void;
  /** Fixed thumbnail edge in px; the grid reflows columns to fit the width. */
  thumbnailSize?: number;
  /** Fixed size (px) of the preview modal and its image box. */
  previewSize?: number;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count for display. Remote images whose size isn't known yet
 * (0) render as "—" rather than a misleading "0 B".
 */
export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const k = 1024;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), SIZE_UNITS.length - 1);
  const value = bytes / Math.pow(k, exponent);
  return `${parseFloat(value.toFixed(exponent === 0 ? 0 : 1))} ${SIZE_UNITS[exponent]}`;
};

const typeLabel = (img: ImageInfo): string => (img.isBase64 ? 'B64' : img.type.toUpperCase());

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload, thumbnailSize = 120, previewSize = 360 }) => {
  // Index-based selection so the modal can page through images without closing.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedImage = selectedIndex !== null ? images[selectedIndex] ?? null : null;

  const close = () => setSelectedIndex(null);
  const hasPrev = selectedIndex !== null && selectedIndex > 0;
  const hasNext = selectedIndex !== null && selectedIndex < images.length - 1;
  const goPrev = () => setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const goNext = () => setSelectedIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));

  // Arrow keys page the modal; Escape closes it. Bound only while open.
  // Logic is inlined via functional updates so the effect needs no callback deps.
  useEffect(() => {
    if (selectedIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      else if (e.key === 'ArrowRight')
        setSelectedIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));
      else if (e.key === 'Escape') setSelectedIndex(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIndex, images.length]);

  return (
    <div>
      {/* Fixed-size thumbnails; a wider panel reflows into more columns rather
          than stretching each image. */}
      <div
        className="grid justify-center gap-2.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}
      >
        {images.map((image, index) => (
          <figure
            key={`${image.src}-${index}`}
            className="card reveal group m-0"
            style={{ animationDelay: `${Math.min(index, 12) * 0.022}s` }}
          >
            <div className="checker relative aspect-square">
              <img
                src={image.thumbnailSrc ?? image.src}
                alt={image.alt}
                loading="lazy"
                className="h-full w-full object-cover"
              />

              {/* Type tag */}
              <span className="eyebrow absolute left-1.5 top-1.5 rounded-[5px] bg-[var(--panel)]/85 px-1.5 py-0.5 text-[9px] leading-none text-[var(--ink)] backdrop-blur-sm">
                {typeLabel(image)}
              </span>

              {/* Hover actions */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[var(--ink)]/0 opacity-0 transition-all duration-150 group-hover:bg-[var(--ink)]/45 group-hover:opacity-100">
                <button
                  onClick={() => setSelectedIndex(index)}
                  title="View Details"
                  aria-label="View Details"
                  className="grid h-8 w-8 place-items-center rounded-full bg-[var(--panel)] text-[var(--ink)] ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onImageDownload(image)}
                  title="Download Image"
                  aria-label="Download Image"
                  className="grid h-8 w-8 place-items-center rounded-full bg-[var(--brand-ink)] text-white transition-transform hover:scale-105 active:scale-95"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5">
              <span className="num truncate text-[10px] text-[var(--ink-3)]">
                {image.width > 0 ? `${image.width}×${image.height}` : '—'}
              </span>
              <span className="num text-[10px] text-[var(--ink-2)]">{formatFileSize(image.fileSize)}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {selectedImage && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/55 p-4 backdrop-blur-[2px]"
          onClick={close}
        >
          <div
            className="sheet-in flex max-h-full w-full flex-col overflow-hidden rounded-[12px] border hairline bg-[var(--panel)] shadow-2xl"
            style={{ maxWidth: Math.max(320, previewSize) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b hairline px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-[var(--ink)]">Image Preview</h3>
                {selectedIndex !== null && (
                  <span className="num text-[11px] text-[var(--ink-3)]">
                    {selectedIndex + 1} / {images.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <a
                  href={selectedImage.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="iconbtn"
                  title="Open in new tab"
                  aria-label="Open in new tab"
                >
                  <ArrowTopRightOnSquareIcon className="h-[17px] w-[17px]" />
                </a>
                <button onClick={close} title="Close" aria-label="Close" className="iconbtn">
                  <XMarkIcon className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            <div className="scroll-thin overflow-y-auto p-4">
              <div className="checker relative overflow-hidden rounded-[8px] border hairline">
                <img
                  src={selectedImage.src}
                  alt={selectedImage.alt}
                  className="mx-auto w-full object-contain"
                  style={{ maxHeight: previewSize }}
                />

                {/* Prev/next — page through images without leaving the modal */}
                {hasPrev && (
                  <button
                    onClick={goPrev}
                    title="Previous image"
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[var(--panel)]/90 text-[var(--ink)] ring-1 ring-black/5 backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                )}
                {hasNext && (
                  <button
                    onClick={goNext}
                    title="Next image"
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[var(--panel)]/90 text-[var(--ink)] ring-1 ring-black/5 backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                {selectedImage.alt && (
                  <>
                    <dt className="eyebrow self-center">Alt</dt>
                    <dd className="truncate text-[var(--ink)]">{selectedImage.alt}</dd>
                  </>
                )}
                <dt className="eyebrow self-center">Size</dt>
                <dd className="num text-[var(--ink)]">
                  {selectedImage.width > 0 ? `${selectedImage.width} × ${selectedImage.height}` : 'Unknown'} · {formatFileSize(selectedImage.fileSize)}
                </dd>
                <dt className="eyebrow self-center">Type</dt>
                <dd className="text-[var(--ink)]">
                  {selectedImage.type.toUpperCase()}
                  {selectedImage.isBase64 ? ' · Base64' : ''}
                </dd>
                <dt className="eyebrow self-start pt-0.5">Source</dt>
                <dd className="num break-all text-[11px] text-[var(--ink-2)]">{selectedImage.src}</dd>
              </dl>
            </div>

            <div className="border-t hairline px-4 py-2.5">
              <button
                onClick={() => onImageDownload(selectedImage)}
                title="Download Image"
                aria-label="Download Image"
                className="btn btn-primary w-full"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                <span>Download Image</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageList;
