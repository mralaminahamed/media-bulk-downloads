import React, { useEffect, useRef, useState } from 'react';
import { ImageInfo, ImageListProps } from '@mbd/core/types';
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
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { PlayBadge } from './icons/PlayBadge';
import { FilmIcon } from './icons/FilmIcon';
import { AudioIcon } from './icons/AudioIcon';
import { LoadingImage } from './LoadingImage';
import { SelectCheckbox } from './fields/SelectCheckbox';
import { hostFromUrl, registrableDomain } from '@mbd/core/collection/paths';

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

/** A Twitter image whose real file hasn't been fetched yet (from an unpainted
 *  /status/photo cell): `src` is an x.com status URL, NOT an image — it must
 *  never be handed to an <img src>. Shown as a neutral placeholder, not
 *  downloadable, and resolved automatically (no per-item fetch action). */
const isPendingImage = (img: ImageInfo): boolean => img.kind === 'image' && !!img.unresolvedImage;

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
  const excludeMenuListRef = useRef<HTMLDivElement>(null);

  // When the menu opens, move focus to its first item so it is fully
  // keyboard-operable (WAI-ARIA menu button pattern); arrow keys then move
  // between items. Without this, a keyboard user lands nowhere on open.
  useEffect(() => {
    if (!excludeMenuOpen) return;
    excludeMenuListRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [excludeMenuOpen]);

  // Arrow/Home/End move focus among the menu items (wrapping). Enter/Space
  // activate the focused item natively (they are <button>s). Works in both the
  // popup (document) and the on-page bubble (shadow root) via getRootNode().
  const onExcludeMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(excludeMenuListRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    // getRootNode() is Document in the popup and ShadowRoot in the bubble; both
    // expose activeElement. Type it structurally to avoid a lib-global name.
    const root = excludeMenuListRef.current?.getRootNode() as unknown as { activeElement: Element | null } | undefined;
    const current = items.indexOf(root?.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break;
      case 'ArrowUp': next = (current - 1 + items.length) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    e.preventDefault();
    items[next]?.focus();
  };

  useEffect(() => {
    if (!excludeMenuOpen) return;
    const onPointer = (e: MouseEvent): void => {
      // Use composedPath, not `contains(e.target)`: on the on-page bubble this
      // component lives in a shadow root, and a document-level listener sees the
      // event RETARGETED to the shadow host — so `contains` would report every
      // click (even one on a menu item) as "outside" and close the menu before
      // the item's onClick fires. composedPath includes the shadow-internal nodes.
      if (excludeMenuRef.current && !e.composedPath().includes(excludeMenuRef.current)) setExcludeMenuOpen(false);
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
        className="mbd:grid mbd:justify-center mbd:gap-2.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}
      >
        {images.map((image, index) => {
          const isSelected = selectedSrcs?.has(image.src) ?? false;
          // Only downloadable items are selectable — a pending video/image has no
          // file yet, and an HLS/DASH stream is captured individually (not
          // bulk-selectable), so it must match the selection guards in App (which
          // skip hlsManifest).
          const selectable = !!onToggleSelect && !isPendingVideo(image) && !isPendingImage(image) && !isHlsStream(image);
          const boxUp = selectable && (selectionActive || isSelected);
          return (
          <figure
            key={image.src}
            className={`card reveal mbd:group mbd:m-0 ${isSelected ? 'mbd:ring-2 mbd:ring-(--brand-ink)' : ''}`}
            style={{
              animationDelay: `${Math.min(index, 12) * 0.022}s`,
              // Skip layout + paint of offscreen tiles (native windowing). The figure
              // is the square thumbnail PLUS a figcaption below it, so a bare
              // `thumbnailSize` placeholder on both axes would under-measure it. Use
              // the `auto <length>` form per axis instead: before first paint the
              // browser falls back to `thumbnailSize`, but once a tile has actually
              // rendered, the browser remembers its real measured size (thumbnail +
              // caption) and uses that instead — self-correcting scroll height for
              // skipped tiles rather than staying wrong for the life of the list.
              contentVisibility: 'auto',
              containIntrinsicSize: `auto ${thumbnailSize}px auto ${thumbnailSize}px`,
            }}
          >
            <div className="checker mbd:relative mbd:aspect-square">
              {selectable && (
                <SelectCheckbox
                  checked={isSelected}
                  onClick={(e) => handleCheckbox(e, image, index)}
                  ariaLabel={isSelected ? 'Deselect item' : 'Select item'}
                  title={isSelected ? 'Deselect item' : 'Select item'}
                  className={`mbd:absolute mbd:left-1.5 mbd:top-1.5 mbd:z-10 ${
                    boxUp ? 'mbd:opacity-100' : 'mbd:opacity-0 mbd:group-hover:opacity-100 mbd:focus-visible:opacity-100'
                  }`}
                />
              )}
              {image.kind === 'image' && !image.unresolvedImage ? (
                <LoadingImage
                  key={image.thumbnailSrc ?? image.src}
                  src={image.thumbnailSrc ?? image.src}
                  alt={image.alt}
                  lazy
                  className="mbd:h-full mbd:w-full mbd:object-cover"
                />
              ) : isPendingImage(image) ? (
                // No real thumbnail exists yet (src is an x.com status URL, not an
                // image) — never point an <img> at it; show a neutral icon instead.
                <div className="mbd:grid mbd:h-full mbd:w-full mbd:place-items-center mbd:bg-(--panel-2)">
                  <PhotoIcon className="mbd:h-8 mbd:w-8 mbd:text-(--ink-3)" />
                </div>
              ) : image.kind === 'video' && image.poster ? (
                <>
                  <LoadingImage
                    key={image.poster}
                    src={image.poster}
                    alt={image.alt}
                    lazy
                    className="mbd:h-full mbd:w-full mbd:object-cover"
                  />
                  <PlayBadge className="mbd:pointer-events-none mbd:absolute mbd:left-1/2 mbd:top-1/2 mbd:h-8 mbd:w-8 mbd:-translate-x-1/2 mbd:-translate-y-1/2 mbd:text-white mbd:drop-shadow" />
                </>
              ) : image.kind === 'video' ? (
                <div className="mbd:grid mbd:h-full mbd:w-full mbd:place-items-center mbd:bg-(--panel-2)">
                  <FilmIcon className="mbd:h-8 mbd:w-8 mbd:text-(--ink-3)" />
                </div>
              ) : (
                <div className="mbd:grid mbd:h-full mbd:w-full mbd:place-items-center mbd:bg-(--panel-2)">
                  <AudioIcon className="mbd:h-8 mbd:w-8 mbd:text-(--ink-3)" />
                </div>
              )}

              {/* Type tag — shares the top-left slot with the select checkbox,
                  so it fades out whenever the checkbox is shown. */}
              <span className={`eyebrow mbd:absolute mbd:left-1.5 mbd:top-1.5 mbd:rounded-xs mbd:bg-(--panel)/85 mbd:px-1.5 mbd:py-0.5 mbd:text-[9px] mbd:leading-none mbd:text-(--ink) mbd:backdrop-blur-sm ${boxUp ? 'mbd:opacity-0' : selectable ? 'mbd:group-hover:opacity-0' : ''}`}>
                {typeLabel(image)}
              </span>

              {(isPendingVideo(image) || isPendingImage(image)) && (
                <span className="eyebrow mbd:absolute mbd:bottom-1.5 mbd:left-1.5 mbd:rounded-xs mbd:bg-(--panel)/85 mbd:px-1.5 mbd:py-0.5 mbd:text-[9px] mbd:leading-none mbd:text-(--ink) mbd:backdrop-blur-sm">
                  {resolveFailedSrcs?.has(image.src) ? "couldn't fetch"
                    : image.resolveHint ? 'not fetched'
                    : isPendingReel(image) ? 'play to fetch'
                    : "can't fetch"}
                </span>
              )}

              {isHlsStream(image) && (
                <span className="eyebrow mbd:absolute mbd:bottom-1.5 mbd:left-1.5 mbd:rounded-xs mbd:bg-(--panel)/85 mbd:px-1.5 mbd:py-0.5 mbd:text-[9px] mbd:leading-none mbd:text-(--ink) mbd:backdrop-blur-sm">
                  HLS · capture
                </span>
              )}

              {downloadedSrcs?.has(image.src) && (
                <span
                  className="mbd:absolute mbd:right-1.5 mbd:top-1.5 mbd:grid mbd:h-4 mbd:w-4 mbd:place-items-center mbd:rounded-full mbd:bg-(--brand-ink) mbd:text-white mbd:ring-1 mbd:ring-(--ctl-ring)"
                  title="Downloaded"
                  aria-label="Downloaded"
                >
                  <svg viewBox="0 0 24 24" className="mbd:h-3 mbd:w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}

              {favouriteSrcs?.has(image.src) && (
                <span
                  className="mbd:absolute mbd:bottom-1.5 mbd:right-1.5 mbd:grid mbd:h-4 mbd:w-4 mbd:place-items-center mbd:rounded-full mbd:bg-(--panel)/85 mbd:text-(--brand-ink) mbd:ring-1 mbd:ring-(--ctl-ring) mbd:backdrop-blur-sm"
                  title="Favourited"
                  aria-label="Favourited"
                >
                  <StarIconSolid className="mbd:h-3 mbd:w-3" aria-hidden="true" />
                </span>
              )}

              {/* Hover / focus actions — also revealed on keyboard focus-within so
                  the buttons aren't mouse-only. */}
              <div className="mbd:absolute mbd:inset-0 mbd:flex mbd:items-center mbd:justify-center mbd:gap-2 mbd:bg-transparent mbd:opacity-0 mbd:transition-all mbd:duration-150 mbd:group-hover:bg-(--scrim) mbd:group-hover:opacity-100 mbd:group-focus-within:bg-(--scrim) mbd:group-focus-within:opacity-100">
                <button
                  onClick={() => setSelectedSrc(image.src)}
                  title="View Details"
                  aria-label="View Details"
                  className="mbd:grid mbd:h-8 mbd:w-8 mbd:place-items-center mbd:rounded-full mbd:bg-(--panel) mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring) mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                >
                  <EyeIcon className="mbd:h-4 mbd:w-4" />
                </button>
                {/* A pending item's `src` is a placeholder (x.com status URL / not-yet-
                    fetched video), not a real file — favouriting it would store that
                    placeholder as entry.src, which FavouritesPanel/HistoryPanel then
                    hand straight to <img src>. Hide the affordance until it resolves. */}
                {onToggleFavourite && !(isPendingImage(image) || isPendingVideo(image)) && (
                  <button
                    onClick={() => onToggleFavourite(image)}
                    title={favouriteSrcs?.has(image.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-label={favouriteSrcs?.has(image.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-pressed={favouriteSrcs?.has(image.src) ?? false}
                    className="mbd:grid mbd:h-8 mbd:w-8 mbd:place-items-center mbd:rounded-full mbd:bg-(--panel) mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring) mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                  >
                    {favouriteSrcs?.has(image.src)
                      ? <StarIconSolid className="mbd:h-4 mbd:w-4 mbd:text-(--brand-ink)" />
                      : <StarIcon className="mbd:h-4 mbd:w-4" />}
                  </button>
                )}
                {isPendingVideo(image) ? (
                  image.resolveHint ? (
                    <button
                      onClick={() => onFetchVideo?.(image)}
                      disabled={fetchingSrcs?.has(image.src)}
                      title={resolveFailedSrcs?.has(image.src) ? 'Retry video' : 'Get video'}
                      aria-label={resolveFailedSrcs?.has(image.src) ? 'Retry video' : 'Get video'}
                      className="mbd:grid mbd:h-8 mbd:w-8 mbd:place-items-center mbd:rounded-full mbd:bg-(--brand-ink) mbd:text-white mbd:ring-1 mbd:ring-(--ctl-ring) mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95 mbd:disabled:opacity-60"
                    >
                      {fetchingSrcs?.has(image.src)
                        ? <ArrowPathIcon className="mbd:h-4 mbd:w-4 mbd:animate-[spin_0.9s_linear_infinite]" />
                        : resolveFailedSrcs?.has(image.src)
                          ? <ArrowPathIcon className="mbd:h-4 mbd:w-4" />
                          : <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />}
                    </button>
                  ) : null
                ) : isPendingImage(image) ? null : (
                  <button
                    onClick={() => onImageDownload(image)}
                    title={isHlsStream(image) ? 'Capture stream' : 'Download'}
                    aria-label={isHlsStream(image) ? 'Capture stream' : 'Download'}
                    className="mbd:grid mbd:h-8 mbd:w-8 mbd:place-items-center mbd:rounded-full mbd:bg-(--brand-ink) mbd:text-white mbd:ring-1 mbd:ring-(--ctl-ring) mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                  >
                    <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
                  </button>
                )}
              </div>
            </div>

            <figcaption className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-1 mbd:px-2 mbd:py-1.5">
              <span className="num mbd:truncate mbd:text-[10px] mbd:text-(--ink-2)">
                {image.kind !== 'image' ? image.type.toUpperCase()
                  : image.width > 0 ? `${image.width}×${image.height}` : '—'}
              </span>
              <span className="num mbd:text-[10px] mbd:text-(--ink-2)">{formatFileSize(image.fileSize)}</span>
            </figcaption>
          </figure>
          );
        })}
      </div>

      {selectedImage && (
        <div
          className="overlay-in mbd:fixed mbd:inset-0 mbd:z-50 mbd:flex mbd:items-center mbd:justify-center mbd:bg-(--overlay) mbd:p-4 mbd:backdrop-blur-[2px]"
          onClick={close}
        >
          <div
            ref={previewRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
            tabIndex={-1}
            className="sheet-in mbd:flex mbd:max-h-full mbd:w-full mbd:flex-col mbd:overflow-hidden mbd:rounded-lg mbd:border hairline mbd:bg-(--panel) mbd:shadow-2xl mbd:focus:outline-none"
            style={{ maxWidth: Math.max(320, previewSize) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-2 mbd:border-b hairline mbd:px-4 mbd:py-2.5">
              <div className="mbd:flex mbd:items-center mbd:gap-2">
                <h3 id="preview-title" className="mbd:text-[13px] mbd:font-semibold mbd:text-(--ink)">Preview</h3>
                {selectedIndex !== null && (
                  <span className="num mbd:text-[11px] mbd:text-(--ink-3)">
                    {selectedIndex + 1} / {images.length}
                  </span>
                )}
              </div>
              <div className="mbd:flex mbd:items-center mbd:gap-0.5">
                {/* Same placeholder-leak guard as the grid tile's favourite button. */}
                {onToggleFavourite && !(isPendingImage(selectedImage) || isPendingVideo(selectedImage)) && (
                  <button
                    onClick={() => onToggleFavourite(selectedImage)}
                    title={favouriteSrcs?.has(selectedImage.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-label={favouriteSrcs?.has(selectedImage.src) ? 'Remove favourite' : 'Add favourite'}
                    aria-pressed={favouriteSrcs?.has(selectedImage.src) ?? false}
                    className="iconbtn"
                  >
                    {favouriteSrcs?.has(selectedImage.src)
                      ? <StarIconSolid className="mbd:h-4.5 mbd:w-4.5 mbd:text-(--brand-ink)" />
                      : <StarIcon className="mbd:h-4.5 mbd:w-4.5" />}
                  </button>
                )}
                {onExclude && (
                  <div ref={excludeMenuRef} className="mbd:relative">
                    <button
                      onClick={() => setExcludeMenuOpen((v) => !v)}
                      title="Exclude source"
                      aria-label="Exclude source"
                      aria-haspopup="menu"
                      aria-expanded={excludeMenuOpen}
                      className="iconbtn"
                    >
                      <NoSymbolIcon className="mbd:h-4.5 mbd:w-4.5" />
                    </button>
                    {excludeMenuOpen && (
                      <div
                        ref={excludeMenuListRef}
                        role="menu"
                        aria-orientation="vertical"
                        onKeyDown={onExcludeMenuKeyDown}
                        className="mbd:absolute mbd:right-0 mbd:top-full mbd:z-20 mbd:mt-1.5 mbd:w-60 mbd:overflow-hidden mbd:rounded-(--radius-sm) mbd:border hairline mbd:bg-(--panel) mbd:py-1 mbd:text-left mbd:shadow-lg"
                      >
                        <p className="eyebrow mbd:px-3 mbd:pb-1 mbd:pt-0.5 mbd:text-(--ink-3)">Add to blocklist</p>
                        <button
                          role="menuitem"
                          // Close the preview after excluding — the shown image is about to be
                          // filtered out of `images`, so closing is deterministic; leaving the
                          // modal open would silently reindex it to a neighbour.
                          onClick={() => { onExclude(selectedImage, 'url'); close(); }}
                          className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-[13px] mbd:text-(--ink) mbd:hover:bg-(--panel-2) mbd:focus:bg-(--panel-2) mbd:focus:outline-none"
                        >
                          <NoSymbolIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
                          <span>Exclude this image</span>
                        </button>
                        {registrableDomain(hostFromUrl(selectedImage.src)) !== '' && (
                          <button
                            role="menuitem"
                            onClick={() => { onExclude(selectedImage, 'host'); close(); }}
                            className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-(--ink) mbd:hover:bg-(--panel-2) mbd:focus:bg-(--panel-2) mbd:focus:outline-none"
                          >
                            <GlobeAltIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
                            <span className="mbd:min-w-0 mbd:flex-1">
                              <span className="mbd:block mbd:text-[13px] mbd:leading-tight">Exclude site</span>
                              <span className="mbd:block mbd:truncate mbd:text-[11px] mbd:leading-tight mbd:text-(--ink-3)">{registrableDomain(hostFromUrl(selectedImage.src))}</span>
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
                  <ArrowTopRightOnSquareIcon className="mbd:h-4.5 mbd:w-4.5" />
                </a>
                <button onClick={close} title="Close" aria-label="Close" className="iconbtn">
                  <XMarkIcon className="mbd:h-4.5 mbd:w-4.5" />
                </button>
              </div>
            </div>

            <div className="scroll-thin mbd:overflow-y-auto mbd:p-4">
              <div
                className="checker mbd:relative mbd:flex mbd:items-center mbd:justify-center mbd:overflow-hidden mbd:rounded-sm mbd:border hairline"
                style={{ minHeight: Math.min(previewSize, 160) }}
              >
                {isPendingVideo(selectedImage) ? (
                  // A pending video from an unpainted /status/<id>/video/<n> cell
                  // carries NO poster — unlike the (older) twitterVideoPending
                  // items, which always have one. `src` there is the x.com status
                  // permalink itself, not a media file, so it must never reach an
                  // <img src>. Degrade to the same neutral glyph the grid tile
                  // uses instead (mirrors the isHlsStream no-poster case below).
                  selectedImage.poster ? (
                    <LoadingImage
                      key={selectedImage.poster}
                      src={selectedImage.poster}
                      alt={selectedImage.alt}
                      className="mbd:mx-auto mbd:w-full mbd:object-contain"
                      style={{ maxHeight: previewSize }}
                    />
                  ) : (
                    <div className="mbd:grid mbd:place-items-center mbd:p-10">
                      <FilmIcon className="mbd:h-12 mbd:w-12 mbd:text-(--ink-3)" />
                    </div>
                  )
                ) : isPendingImage(selectedImage) ? (
                  // No poster exists for a pending image (unlike pending video) — degrade
                  // to a neutral icon rather than pointing an <img> at the status URL.
                  <div className="mbd:grid mbd:place-items-center mbd:p-10">
                    <PhotoIcon className="mbd:h-12 mbd:w-12 mbd:text-(--ink-3)" />
                  </div>
                ) : isHlsStream(selectedImage) ? (
                  // An HLS manifest can't play in a bare <video>; show the poster
                  // (or a film glyph) — the file is produced by Capture, not here.
                  selectedImage.poster ? (
                    <LoadingImage
                      key={selectedImage.poster}
                      src={selectedImage.poster}
                      alt={selectedImage.alt}
                      className="mbd:mx-auto mbd:w-full mbd:object-contain"
                      style={{ maxHeight: previewSize }}
                    />
                  ) : (
                    <div className="mbd:grid mbd:place-items-center mbd:p-10">
                      <FilmIcon className="mbd:h-12 mbd:w-12 mbd:text-(--ink-3)" />
                    </div>
                  )
                ) : selectedImage.kind === 'video' ? (
                  <video
                    key={selectedImage.src}
                    src={selectedImage.src}
                    poster={selectedImage.poster}
                    controls
                    className="mbd:mx-auto mbd:w-full"
                    style={{ maxHeight: previewSize }}
                  />
                ) : selectedImage.kind === 'audio' ? (
                  <div className="mbd:flex mbd:flex-col mbd:items-center mbd:gap-3 mbd:p-6">
                    <AudioIcon className="mbd:h-12 mbd:w-12 mbd:text-(--ink-3)" />
                    <audio key={selectedImage.src} src={selectedImage.src} controls className="mbd:w-full" />
                  </div>
                ) : (
                  <LoadingImage
                    key={selectedImage.src}
                    src={selectedImage.src}
                    alt={selectedImage.alt}
                    className="mbd:mx-auto mbd:w-full mbd:object-contain"
                    style={{ maxHeight: previewSize }}
                  />
                )}

                {/* Prev/next — page through images without leaving the modal */}
                {hasPrev && (
                  <button
                    onClick={goPrev}
                    title="Previous image"
                    aria-label="Previous image"
                    className="mbd:absolute mbd:left-2 mbd:top-1/2 mbd:grid mbd:h-8 mbd:w-8 mbd:-translate-y-1/2 mbd:place-items-center mbd:rounded-full mbd:bg-(--panel)/90 mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring) mbd:backdrop-blur-sm mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                  >
                    <ChevronLeftIcon className="mbd:h-5 mbd:w-5" />
                  </button>
                )}
                {hasNext && (
                  <button
                    onClick={goNext}
                    title="Next image"
                    aria-label="Next image"
                    className="mbd:absolute mbd:right-2 mbd:top-1/2 mbd:grid mbd:h-8 mbd:w-8 mbd:-translate-y-1/2 mbd:place-items-center mbd:rounded-full mbd:bg-(--panel)/90 mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring) mbd:backdrop-blur-sm mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                  >
                    <ChevronRightIcon className="mbd:h-5 mbd:w-5" />
                  </button>
                )}
              </div>

              <dl className="mbd:mt-3 mbd:grid mbd:grid-cols-[auto_1fr] mbd:gap-x-4 mbd:gap-y-1.5 mbd:text-[12px]">
                {selectedImage.alt && (
                  <>
                    <dt className="eyebrow mbd:self-center">Alt</dt>
                    <dd className="mbd:truncate mbd:text-(--ink)">{selectedImage.alt}</dd>
                  </>
                )}
                <dt className="eyebrow mbd:self-center">Size</dt>
                <dd className="num mbd:text-(--ink)">
                  {selectedImage.kind !== 'image' ? '—' : selectedImage.width > 0 ? `${selectedImage.width} × ${selectedImage.height}` : 'Unknown'} · {formatFileSize(selectedImage.fileSize)}
                </dd>
                <dt className="eyebrow mbd:self-center">Type</dt>
                <dd className="mbd:text-(--ink)">
                  {selectedImage.type.toUpperCase()}
                  {selectedImage.isBase64 ? ' · Base64' : ''}
                </dd>
                <dt className="eyebrow mbd:self-center">Kind</dt>
                <dd className="mbd:text-(--ink)">{selectedImage.kind}</dd>
                <dt className="eyebrow mbd:self-start mbd:pt-0.5">Source</dt>
                <dd className="num mbd:break-all mbd:text-[11px] mbd:text-(--ink-2)">{selectedImage.src}</dd>
              </dl>
            </div>

            <div className="mbd:border-t hairline mbd:px-4 mbd:py-2.5">
              {isPendingVideo(selectedImage) ? (
                selectedImage.resolveHint ? (
                  <button
                    onClick={() => onFetchVideo?.(selectedImage)}
                    disabled={fetchingSrcs?.has(selectedImage.src)}
                    className="btn btn-primary mbd:w-full mbd:disabled:opacity-60"
                  >
                    {fetchingSrcs?.has(selectedImage.src) ? (
                      <>
                        <ArrowPathIcon className="mbd:h-4 mbd:w-4 mbd:animate-[spin_0.9s_linear_infinite]" />
                        <span>Fetching…</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
                        <span>{resolveFailedSrcs?.has(selectedImage.src) ? "Couldn't fetch — retry" : 'Get video'}</span>
                      </>
                    )}
                  </button>
                ) : isPendingReel(selectedImage) ? (
                  <p className="mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">Play this reel on Instagram, then rescan — its video will be downloadable.</p>
                ) : (
                  <p className="mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">{"This video's file can't be fetched."}</p>
                )
              ) : isPendingImage(selectedImage) ? (
                <p className="mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">
                  This image hasn&apos;t been fetched yet — turn on &ldquo;Resolve exact originals&rdquo; in Settings to load it automatically.
                </p>
              ) : (
                <button onClick={() => onImageDownload(selectedImage)} title={isHlsStream(selectedImage) ? 'Capture stream' : 'Download'} aria-label={isHlsStream(selectedImage) ? 'Capture stream' : 'Download'} className="btn btn-primary mbd:w-full">
                  <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
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
