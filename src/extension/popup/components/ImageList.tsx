import React, { useEffect, useState } from 'react';
import { ImageInfo } from '@/types';
import { useDialog } from '../hooks/useDialog';
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
  /** Set of image srcs already downloaded; renders a ✓ badge on matching tiles. */
  downloadedSrcs?: Set<string>;
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

/** Centered ▶ badge overlaid on a video thumbnail that has a poster. */
const PlayBadge: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" />
  </svg>
);

/** Placeholder tile icon for videos with no poster. */
const FilmIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" />
  </svg>
);

/** Placeholder tile icon for audio items. */
const AudioIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

/**
 * Image with a shimmer skeleton underneath until it decodes. `onError` also
 * clears the skeleton so a broken image doesn't shimmer forever. Callers key
 * this by src so navigating to a new image resets the loading state.
 */
export const LoadingImage: React.FC<{
  src: string;
  alt: string;
  className: string;
  style?: React.CSSProperties;
  lazy?: boolean;
}> = ({ src, alt, className, style, lazy }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <span className="skeleton absolute inset-0" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`${className} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={style}
      />
    </>
  );
};

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload, thumbnailSize = 120, previewSize = 360, downloadedSrcs }) => {
  // Index-based selection so the modal can page through images without closing.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedImage = selectedIndex !== null ? images[selectedIndex] ?? null : null;

  const close = () => setSelectedIndex(null);
  const hasPrev = selectedIndex !== null && selectedIndex > 0;
  const hasNext = selectedIndex !== null && selectedIndex < images.length - 1;
  const goPrev = () => setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const goNext = () => setSelectedIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));

  // Dialog wiring (focus, Tab trap, Escape-to-close, focus restore) while open.
  const previewRef = useDialog(close, selectedIndex !== null);

  // Arrow keys page the modal. Bound only while open. Logic is inlined via
  // functional updates so the effect needs no callback deps.
  useEffect(() => {
    if (selectedIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      else if (e.key === 'ArrowRight')
        setSelectedIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));
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
            key={image.src}
            className="card reveal group m-0"
            style={{ animationDelay: `${Math.min(index, 12) * 0.022}s` }}
          >
            <div className="checker relative aspect-square">
              {image.kind === 'image' ? (
                <LoadingImage
                  key={image.thumbnailSrc ?? image.src}
                  src={image.thumbnailSrc ?? image.src}
                  alt={image.alt}
                  lazy
                  className="h-full w-full object-cover"
                />
              ) : image.kind === 'video' && image.poster ? (
                <>
                  <LoadingImage
                    key={image.poster}
                    src={image.poster}
                    alt={image.alt}
                    lazy
                    className="h-full w-full object-cover"
                  />
                  <PlayBadge className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
                </>
              ) : image.kind === 'video' ? (
                <div className="grid h-full w-full place-items-center bg-(--panel-2)">
                  <FilmIcon className="h-8 w-8 text-(--ink-3)" />
                </div>
              ) : (
                <div className="grid h-full w-full place-items-center bg-(--panel-2)">
                  <AudioIcon className="h-8 w-8 text-(--ink-3)" />
                </div>
              )}

              {/* Type tag */}
              <span className="eyebrow absolute left-1.5 top-1.5 rounded-xs bg-(--panel)/85 px-1.5 py-0.5 text-[9px] leading-none text-(--ink) backdrop-blur-sm">
                {typeLabel(image)}
              </span>

              {downloadedSrcs?.has(image.src) && (
                <span
                  className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-(--brand-ink) text-white ring-1 ring-(--ctl-ring)"
                  title="Downloaded"
                  aria-label="Downloaded"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}

              {/* Hover / focus actions — also revealed on keyboard focus-within so
                  the buttons aren't mouse-only. */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-transparent opacity-0 transition-all duration-150 group-hover:bg-(--scrim) group-hover:opacity-100 group-focus-within:bg-(--scrim) group-focus-within:opacity-100">
                <button
                  onClick={() => setSelectedIndex(index)}
                  title="View Details"
                  aria-label="View Details"
                  className="grid h-8 w-8 place-items-center rounded-full bg-(--panel) text-(--ink) ring-1 ring-(--ctl-ring) transition-transform hover:scale-105 active:scale-95"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onImageDownload(image)}
                  title="Download"
                  aria-label="Download"
                  className="grid h-8 w-8 place-items-center rounded-full bg-(--brand-ink) text-white ring-1 ring-(--ctl-ring) transition-transform hover:scale-105 active:scale-95"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5">
              <span className="num truncate text-[10px] text-(--ink-2)">
                {image.kind !== 'image' ? image.type.toUpperCase()
                  : image.width > 0 ? `${image.width}×${image.height}` : '—'}
              </span>
              <span className="num text-[10px] text-(--ink-2)">{formatFileSize(image.fileSize)}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {selectedImage && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-(--overlay) p-4 backdrop-blur-[2px]"
          onClick={close}
        >
          <div
            ref={previewRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
            tabIndex={-1}
            className="sheet-in flex max-h-full w-full flex-col overflow-hidden rounded-lg border hairline bg-(--panel) shadow-2xl focus:outline-none"
            style={{ maxWidth: Math.max(320, previewSize) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b hairline px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 id="preview-title" className="text-[13px] font-semibold text-(--ink)">Preview</h3>
                {selectedIndex !== null && (
                  <span className="num text-[11px] text-(--ink-3)">
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
                  <ArrowTopRightOnSquareIcon className="h-4.5 w-4.5" />
                </a>
                <button onClick={close} title="Close" aria-label="Close" className="iconbtn">
                  <XMarkIcon className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            <div className="scroll-thin overflow-y-auto p-4">
              <div
                className="checker relative flex items-center justify-center overflow-hidden rounded-sm border hairline"
                style={{ minHeight: Math.min(previewSize, 160) }}
              >
                {selectedImage.kind === 'video' ? (
                  <video
                    key={selectedImage.src}
                    src={selectedImage.src}
                    poster={selectedImage.poster}
                    controls
                    className="mx-auto w-full"
                    style={{ maxHeight: previewSize }}
                  />
                ) : selectedImage.kind === 'audio' ? (
                  <div className="flex flex-col items-center gap-3 p-6">
                    <AudioIcon className="h-12 w-12 text-(--ink-3)" />
                    <audio key={selectedImage.src} src={selectedImage.src} controls className="w-full" />
                  </div>
                ) : (
                  <LoadingImage
                    key={selectedImage.src}
                    src={selectedImage.src}
                    alt={selectedImage.alt}
                    className="mx-auto w-full object-contain"
                    style={{ maxHeight: previewSize }}
                  />
                )}

                {/* Prev/next — page through images without leaving the modal */}
                {hasPrev && (
                  <button
                    onClick={goPrev}
                    title="Previous image"
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-(--panel)/90 text-(--ink) ring-1 ring-(--ctl-ring) backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                )}
                {hasNext && (
                  <button
                    onClick={goNext}
                    title="Next image"
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-(--panel)/90 text-(--ink) ring-1 ring-(--ctl-ring) backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                {selectedImage.alt && (
                  <>
                    <dt className="eyebrow self-center">Alt</dt>
                    <dd className="truncate text-(--ink)">{selectedImage.alt}</dd>
                  </>
                )}
                <dt className="eyebrow self-center">Size</dt>
                <dd className="num text-(--ink)">
                  {selectedImage.kind !== 'image' ? '—' : selectedImage.width > 0 ? `${selectedImage.width} × ${selectedImage.height}` : 'Unknown'} · {formatFileSize(selectedImage.fileSize)}
                </dd>
                <dt className="eyebrow self-center">Type</dt>
                <dd className="text-(--ink)">
                  {selectedImage.type.toUpperCase()}
                  {selectedImage.isBase64 ? ' · Base64' : ''}
                </dd>
                <dt className="eyebrow self-center">Kind</dt>
                <dd className="text-(--ink)">{selectedImage.kind}</dd>
                <dt className="eyebrow self-start pt-0.5">Source</dt>
                <dd className="num break-all text-[11px] text-(--ink-2)">{selectedImage.src}</dd>
              </dl>
            </div>

            <div className="border-t hairline px-4 py-2.5">
              <button
                onClick={() => onImageDownload(selectedImage)}
                title="Download"
                aria-label="Download"
                className="btn btn-primary w-full"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageList;
