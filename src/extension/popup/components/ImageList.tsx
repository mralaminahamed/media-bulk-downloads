import React, { useEffect, useState } from 'react';
import { ImageInfo, ImageListProps } from '@/types';
import { useDialog } from '../hooks/useDialog';
import {
  EyeIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  StarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { PlayBadge } from './icons/PlayBadge';
import { FilmIcon } from './icons/FilmIcon';
import { AudioIcon } from './icons/AudioIcon';
import { LoadingImage } from './LoadingImage';

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

/** A Twitter video whose real file hasn't been fetched yet: shown, not downloadable. */
const isPendingVideo = (img: ImageInfo): boolean => img.kind === 'video' && !!img.unresolvedVideo;

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload, thumbnailSize = 120, previewSize = 360, downloadedSrcs, favouriteSrcs, onToggleFavourite, onFetchVideo, resolveFailedSrcs, fetchingSrcs }) => {
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

              {isPendingVideo(image) && (
                <span className="eyebrow absolute bottom-1.5 left-1.5 rounded-xs bg-(--panel)/85 px-1.5 py-0.5 text-[9px] leading-none text-(--ink) backdrop-blur-sm">
                  {resolveFailedSrcs?.has(image.src) ? "couldn't fetch"
                    : image.resolveHint ? 'not fetched'
                    : "can't fetch"}
                </span>
              )}

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

              {favouriteSrcs?.has(image.src) && (
                <span
                  className="absolute bottom-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-(--panel)/85 text-(--brand-ink) ring-1 ring-(--ctl-ring) backdrop-blur-sm"
                  title="Favourited"
                  aria-label="Favourited"
                >
                  <StarIconSolid className="h-3 w-3" aria-hidden="true" />
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
                {onToggleFavourite && (
                  <button
                    onClick={() => onToggleFavourite(image)}
                    title={favouriteSrcs?.has(image.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-label={favouriteSrcs?.has(image.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-pressed={favouriteSrcs?.has(image.src) ?? false}
                    className="grid h-8 w-8 place-items-center rounded-full bg-(--panel) text-(--ink) ring-1 ring-(--ctl-ring) transition-transform hover:scale-105 active:scale-95"
                  >
                    {favouriteSrcs?.has(image.src)
                      ? <StarIconSolid className="h-4 w-4 text-(--brand-ink)" />
                      : <StarIcon className="h-4 w-4" />}
                  </button>
                )}
                {isPendingVideo(image) ? (
                  image.resolveHint ? (
                    <button
                      onClick={() => onFetchVideo?.(image)}
                      disabled={fetchingSrcs?.has(image.src)}
                      title={resolveFailedSrcs?.has(image.src) ? 'Retry video' : 'Get video'}
                      aria-label={resolveFailedSrcs?.has(image.src) ? 'Retry video' : 'Get video'}
                      className="grid h-8 w-8 place-items-center rounded-full bg-(--brand-ink) text-white ring-1 ring-(--ctl-ring) transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                    >
                      {fetchingSrcs?.has(image.src)
                        ? <ArrowPathIcon className="h-4 w-4 animate-[spin_0.9s_linear_infinite]" />
                        : resolveFailedSrcs?.has(image.src)
                          ? <ArrowPathIcon className="h-4 w-4" />
                          : <ArrowDownTrayIcon className="h-4 w-4" />}
                    </button>
                  ) : null
                ) : (
                  <button
                    onClick={() => onImageDownload(image)}
                    title="Download"
                    aria-label="Download"
                    className="grid h-8 w-8 place-items-center rounded-full bg-(--brand-ink) text-white ring-1 ring-(--ctl-ring) transition-transform hover:scale-105 active:scale-95"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                )}
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
                {onToggleFavourite && (
                  <button
                    onClick={() => onToggleFavourite(selectedImage)}
                    title={favouriteSrcs?.has(selectedImage.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-label={favouriteSrcs?.has(selectedImage.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-pressed={favouriteSrcs?.has(selectedImage.src) ?? false}
                    className="iconbtn"
                  >
                    {favouriteSrcs?.has(selectedImage.src)
                      ? <StarIconSolid className="h-4.5 w-4.5 text-(--brand-ink)" />
                      : <StarIcon className="h-4.5 w-4.5" />}
                  </button>
                )}
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
                {isPendingVideo(selectedImage) ? (
                  <LoadingImage
                    key={selectedImage.poster ?? selectedImage.src}
                    src={selectedImage.poster ?? selectedImage.src}
                    alt={selectedImage.alt}
                    className="mx-auto w-full object-contain"
                    style={{ maxHeight: previewSize }}
                  />
                ) : selectedImage.kind === 'video' ? (
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
              {isPendingVideo(selectedImage) ? (
                selectedImage.resolveHint ? (
                  <button
                    onClick={() => onFetchVideo?.(selectedImage)}
                    disabled={fetchingSrcs?.has(selectedImage.src)}
                    className="btn btn-primary w-full disabled:opacity-60"
                  >
                    {fetchingSrcs?.has(selectedImage.src) ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-[spin_0.9s_linear_infinite]" />
                        <span>Fetching…</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        <span>{resolveFailedSrcs?.has(selectedImage.src) ? "Couldn't fetch — retry" : 'Get video'}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-center text-[12px] text-(--ink-2)">{"This video's file can't be fetched."}</p>
                )
              ) : (
                <button onClick={() => onImageDownload(selectedImage)} title="Download" aria-label="Download" className="btn btn-primary w-full">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span>Download</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageList;
