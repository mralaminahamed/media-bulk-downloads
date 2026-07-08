import React, { useEffect, useRef, useState } from 'react';
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
  NoSymbolIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { PlayBadge } from './icons/PlayBadge';
import { FilmIcon } from './icons/FilmIcon';
import { AudioIcon } from './icons/AudioIcon';
import { LoadingImage } from './LoadingImage';
import { SelectCheckbox } from './fields/SelectCheckbox';
import { hostFromUrl, registrableDomain } from '@/extension/shared/collection/paths';

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

/** An HLS stream: downloadable, but by capturing (fetch + assemble segments)
 *  rather than a single-file download, so the action reads "Capture stream". */
const isHlsStream = (img: ImageInfo): boolean => !!img.hlsManifest;

/** True for a URL on an Instagram CDN host. */
const isIgUrl = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const h = new URL(u).hostname;
    return h.endsWith('cdninstagram.com') || h.endsWith('fbcdn.net');
  } catch {
    return false;
  }
};

/**
 * A pending Instagram reel: its mp4 isn't in the feed but appears the moment the
 * reel plays (captured by the sniffer), so it's not "can't fetch" — it's "play to
 * fetch". Reels carry no resolveHint (there's no network resolve for them); their
 * src/poster is on an Instagram CDN.
 */
const isPendingReel = (img: ImageInfo): boolean =>
  isPendingVideo(img) && !img.resolveHint && (isIgUrl(img.src) || isIgUrl(img.poster));

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload, thumbnailSize = 120, previewSize = 360, downloadedSrcs, favouriteSrcs, onToggleFavourite, onExclude, onFetchVideo, resolveFailedSrcs, fetchingSrcs, selectedSrcs, selectionActive, onToggleSelect, onSelectRange }) => {
  // Track the previewed item by identity (src), not position: `images` re-sorts
  // and re-filters asynchronously (streaming sizes, resolved originals), so a
  // bare index would swap the modal to a different item — or unmount it — mid-view.
  const [selectedSrc, setSelectedSrc] = useState<string | null>(null);
  const selectedIndex = selectedSrc !== null ? images.findIndex((i) => i.src === selectedSrc) : -1;
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null;

  // The preview modal's exclude menu (open/closed). The modal shows one image, so
  // a single boolean + one wrapper ref back the outside-click / Escape close.
  const [excludeMenuOpen, setExcludeMenuOpen] = useState(false);
  const excludeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!excludeMenuOpen) return;
    const onPointer = (e: MouseEvent): void => {
      if (excludeMenuRef.current && !excludeMenuRef.current.contains(e.target as Node)) setExcludeMenuOpen(false);
    };
    // Capture phase + stopPropagation so Escape closes ONLY the menu — useDialog's
    // bubble-phase Escape (which closes the whole modal) never receives the event.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setExcludeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [excludeMenuOpen]);

  // Anchor for Shift-click range selection (index of the last checkbox toggled).
  const rangeAnchor = useRef<number | null>(null);
  // Reset it when the shown COUNT changes (filter/search/rescan add or remove
  // items) so a stale index can't select an unexpected span against the new,
  // shorter array. Keyed on length, not identity, so a selection re-render (which
  // hands down a fresh array of the same items) doesn't wipe an in-progress anchor.
  useEffect(() => { rangeAnchor.current = null; }, [images.length]);
  const handleCheckbox = (e: React.MouseEvent, image: ImageInfo, index: number): void => {
    e.stopPropagation();
    if (e.shiftKey && rangeAnchor.current !== null && onSelectRange) {
      const [a, b] = rangeAnchor.current <= index ? [rangeAnchor.current, index] : [index, rangeAnchor.current];
      onSelectRange(images.slice(a, b + 1));
    } else {
      onToggleSelect?.(image);
    }
    rangeAnchor.current = index;
  };

  const close = () => {
    setSelectedSrc(null);
    setExcludeMenuOpen(false);
  };
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < images.length - 1;
  const goPrev = () => { if (selectedIndex > 0) setSelectedSrc(images[selectedIndex - 1].src); };
  const goNext = () => { if (selectedIndex >= 0 && selectedIndex < images.length - 1) setSelectedSrc(images[selectedIndex + 1].src); };

  // Dialog wiring (focus, Tab trap, Escape-to-close, focus restore) while open.
  // Keyed off selectedImage (derived): if the tracked item leaves the list its
  // index goes -1, selectedImage becomes null, and the modal simply unrenders.
  const previewRef = useDialog(close, selectedImage !== null);

  // Arrow keys page the modal. Bound only while open; each neighbour is resolved
  // from the current list by position around the tracked item's live index.
  useEffect(() => {
    if (selectedImage === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Paging changes the shown image, so close the exclude menu — otherwise its
      // items would act on (and its host sublabel would show) a different image.
      setExcludeMenuOpen(false);
      if (e.key === 'ArrowLeft') { if (selectedIndex > 0) setSelectedSrc(images[selectedIndex - 1].src); }
      else if (selectedIndex >= 0 && selectedIndex < images.length - 1) setSelectedSrc(images[selectedIndex + 1].src);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedImage, selectedIndex, images]);

  return (
    <div>
      {/* Fixed-size thumbnails; a wider panel reflows into more columns rather
          than stretching each image. */}
      <div
        className="grid justify-center gap-2.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}
      >
        {images.map((image, index) => {
          const isSelected = selectedSrcs?.has(image.src) ?? false;
          // Only downloadable items are selectable — a pending video has no file,
          // and an HLS/DASH stream is captured individually (not bulk-selectable),
          // so it must match the selection guards in App (which skip hlsManifest).
          const selectable = !!onToggleSelect && !isPendingVideo(image) && !isHlsStream(image);
          const boxUp = selectable && (selectionActive || isSelected);
          return (
          <figure
            key={image.src}
            className={`card reveal group m-0 ${isSelected ? 'ring-2 ring-(--brand-ink)' : ''}`}
            style={{ animationDelay: `${Math.min(index, 12) * 0.022}s` }}
          >
            <div className="checker relative aspect-square">
              {selectable && (
                <SelectCheckbox
                  checked={isSelected}
                  onClick={(e) => handleCheckbox(e, image, index)}
                  ariaLabel={isSelected ? 'Deselect item' : 'Select item'}
                  title={isSelected ? 'Deselect item' : 'Select item'}
                  className={`absolute left-1.5 top-1.5 z-10 ${
                    boxUp ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                  }`}
                />
              )}
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

              {/* Type tag — shares the top-left slot with the select checkbox,
                  so it fades out whenever the checkbox is shown. */}
              <span className={`eyebrow absolute left-1.5 top-1.5 rounded-xs bg-(--panel)/85 px-1.5 py-0.5 text-[9px] leading-none text-(--ink) backdrop-blur-sm ${boxUp ? 'opacity-0' : selectable ? 'group-hover:opacity-0' : ''}`}>
                {typeLabel(image)}
              </span>

              {isPendingVideo(image) && (
                <span className="eyebrow absolute bottom-1.5 left-1.5 rounded-xs bg-(--panel)/85 px-1.5 py-0.5 text-[9px] leading-none text-(--ink) backdrop-blur-sm">
                  {resolveFailedSrcs?.has(image.src) ? "couldn't fetch"
                    : image.resolveHint ? 'not fetched'
                    : isPendingReel(image) ? 'play to fetch'
                    : "can't fetch"}
                </span>
              )}

              {isHlsStream(image) && (
                <span className="eyebrow absolute bottom-1.5 left-1.5 rounded-xs bg-(--panel)/85 px-1.5 py-0.5 text-[9px] leading-none text-(--ink) backdrop-blur-sm">
                  HLS · capture
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
                  onClick={() => setSelectedSrc(image.src)}
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
                    title={isHlsStream(image) ? 'Capture stream' : 'Download'}
                    aria-label={isHlsStream(image) ? 'Capture stream' : 'Download'}
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
          );
        })}
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
                {onExclude && (
                  <div ref={excludeMenuRef} className="relative">
                    <button
                      onClick={() => setExcludeMenuOpen((v) => !v)}
                      title="Exclude source"
                      aria-label="Exclude source"
                      aria-haspopup="menu"
                      aria-expanded={excludeMenuOpen}
                      className="iconbtn"
                    >
                      <NoSymbolIcon className="h-4.5 w-4.5" />
                    </button>
                    {excludeMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-(--radius-sm) border hairline bg-(--panel) py-1 text-left shadow-lg"
                      >
                        <p className="eyebrow px-3 pb-1 pt-0.5 text-(--ink-3)">Add to blocklist</p>
                        <button
                          role="menuitem"
                          // Close the preview after excluding — the shown image is about to be
                          // filtered out of `images`, so closing is deterministic; leaving the
                          // modal open would silently reindex it to a neighbour.
                          onClick={() => { onExclude(selectedImage, 'url'); close(); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-(--ink) hover:bg-(--panel-2) focus:bg-(--panel-2) focus:outline-none"
                        >
                          <NoSymbolIcon className="h-4 w-4 shrink-0 text-(--ink-2)" />
                          <span>Exclude this image</span>
                        </button>
                        {registrableDomain(hostFromUrl(selectedImage.src)) !== '' && (
                          <button
                            role="menuitem"
                            onClick={() => { onExclude(selectedImage, 'host'); close(); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-(--ink) hover:bg-(--panel-2) focus:bg-(--panel-2) focus:outline-none"
                          >
                            <GlobeAltIcon className="h-4 w-4 shrink-0 text-(--ink-2)" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] leading-tight">Exclude site</span>
                              <span className="block truncate text-[11px] leading-tight text-(--ink-3)">{registrableDomain(hostFromUrl(selectedImage.src))}</span>
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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
                ) : isHlsStream(selectedImage) ? (
                  // An HLS manifest can't play in a bare <video>; show the poster
                  // (or a film glyph) — the file is produced by Capture, not here.
                  selectedImage.poster ? (
                    <LoadingImage
                      key={selectedImage.poster}
                      src={selectedImage.poster}
                      alt={selectedImage.alt}
                      className="mx-auto w-full object-contain"
                      style={{ maxHeight: previewSize }}
                    />
                  ) : (
                    <div className="grid place-items-center p-10">
                      <FilmIcon className="h-12 w-12 text-(--ink-3)" />
                    </div>
                  )
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
                ) : isPendingReel(selectedImage) ? (
                  <p className="text-center text-[12px] text-(--ink-2)">Play this reel on Instagram, then rescan — its video will be downloadable.</p>
                ) : (
                  <p className="text-center text-[12px] text-(--ink-2)">{"This video's file can't be fetched."}</p>
                )
              ) : (
                <button onClick={() => onImageDownload(selectedImage)} title={isHlsStream(selectedImage) ? 'Capture stream' : 'Download'} aria-label={isHlsStream(selectedImage) ? 'Capture stream' : 'Download'} className="btn btn-primary w-full">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span>{isHlsStream(selectedImage) ? 'Capture stream' : 'Download'}</span>
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
