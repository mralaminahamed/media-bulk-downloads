import React, { useEffect, useRef, useState } from 'react';
import { AudioFormat, ImageInfo, ImageListProps } from '@mbd/core/types';
import { AUDIO_FORMAT_LABELS, AUDIO_FORMATS } from '@mbd/core/download/stream/mp3';
import { useDialog } from '@/extension/popup/hooks/useDialog';
import { useStreamVariants } from '@/extension/popup/hooks/useStreamVariants';
import type { VariantState } from '@/extension/popup/hooks/useStreamVariants';
import StreamVariantSelect from '@/extension/popup/components/StreamVariantSelect';
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
import { PlayBadge } from '@/extension/popup/components/icons/PlayBadge';
import { FilmIcon } from '@/extension/popup/components/icons/FilmIcon';
import { AudioIcon } from '@/extension/popup/components/icons/AudioIcon';
import { LoadingImage } from '@/extension/popup/components/LoadingImage';
import { SelectCheckbox } from '@/extension/popup/components/fields/SelectCheckbox';
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

/** Hover tooltip naming the source tab for a multi-tab-collected item (#283);
 *  undefined for active-tab items (no tooltip). */
const sourceTooltip = (img: ImageInfo): string | undefined => {
  if (!img.sourcePage) return undefined;
  let host = img.sourcePage.url;
  try {
    host = new URL(img.sourcePage.url).host;
  } catch {
    /* keep the raw string */
  }
  return img.sourcePage.title ? `From ${host} — ${img.sourcePage.title}` : `From ${host}`;
};

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

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload, onCaptureAudio, onCaptureStream, audioFormat, thumbnailSize = 120, previewSize = 360, downloadedSrcs, favouriteSrcs, onToggleFavourite, onExclude, onFetchVideo, resolveFailedSrcs, fetchingSrcs, selectedSrcs, selectionActive, onToggleSelect, onSelectRange }) => {
  const defaultAudioFormat: AudioFormat = audioFormat ?? 'm4a';
  const [selectedSrc, setSelectedSrc] = useState<string | null>(null);
  const selectedIndex = selectedSrc !== null ? images.findIndex((i) => i.src === selectedSrc) : -1;
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null;

  const [audioChoice, setAudioChoice] = useState<{ src: string | null; format: AudioFormat | 'default' }>({ src: null, format: 'default' });
  const audioOverride: AudioFormat | 'default' = audioChoice.src === selectedSrc ? audioChoice.format : 'default';

  const { states: variantStates, ensure: ensureVariants } = useStreamVariants();
  const [heightBySrc, setHeightBySrc] = useState<Map<string, number>>(new Map());
  const setHeight = (src: string, height: number | null): void =>
    setHeightBySrc((prev) => { const m = new Map(prev); if (height == null) m.delete(src); else m.set(src, height); return m; });
  const streamState = (img: ImageInfo): VariantState => variantStates.get(img.hlsManifest ?? '') ?? { status: 'idle', variants: [] };
  const captureVideo = (img: ImageInfo): void =>
    (onCaptureStream ? onCaptureStream(img, heightBySrc.get(img.src)) : onImageDownload(img));

  const [excludeMenuOpen, setExcludeMenuOpen] = useState(false);
  const excludeMenuRef = useRef<HTMLDivElement>(null);
  const excludeMenuListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!excludeMenuOpen) return;
    excludeMenuListRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [excludeMenuOpen]);

  const onExcludeMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(excludeMenuListRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
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
      if (excludeMenuRef.current && !e.composedPath().includes(excludeMenuRef.current)) setExcludeMenuOpen(false);
    };
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

  const rangeAnchor = useRef<number | null>(null);
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

  const previewRef = useDialog(close, selectedImage !== null);

  useEffect(() => {
    if (selectedImage === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
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
          const selectable = !!onToggleSelect && !isPendingVideo(image) && !isPendingImage(image) && !isHlsStream(image);
          const boxUp = selectable && (selectionActive || isSelected);
          return (
          <figure
            key={image.src}
            title={sourceTooltip(image)}
            className={`card reveal mbd:group mbd:m-0 ${isSelected ? 'mbd:ring-2 mbd:ring-(--brand-ink)' : ''}`}
            style={{
              animationDelay: `${Math.min(index, 12) * 0.022}s`,
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
                  <>
                    {isHlsStream(image) && onCaptureAudio && (
                      <button
                        onClick={() => onCaptureAudio(image)}
                        title={`Audio only — ${AUDIO_FORMAT_LABELS[defaultAudioFormat]}`}
                        aria-label={`Capture audio only (${AUDIO_FORMAT_LABELS[defaultAudioFormat]})`}
                        className="mbd:grid mbd:h-8 mbd:w-8 mbd:place-items-center mbd:rounded-full mbd:bg-(--panel) mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring) mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                      >
                        <AudioIcon className="mbd:h-4 mbd:w-4" />
                      </button>
                    )}
                    {isHlsStream(image) && onCaptureStream && (
                      <StreamVariantSelect
                        state={streamState(image)}
                        value={heightBySrc.get(image.src) ?? null}
                        onEnsure={() => ensureVariants(image.hlsManifest!, image.type === 'mpd' ? 'dash' : 'hls')}
                        onChange={(h) => setHeight(image.src, h)}
                        className="mbd:max-w-14 mbd:rounded-full mbd:bg-(--panel) mbd:text-[10px] mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring)"
                      />
                    )}
                    <button
                      onClick={() => (isHlsStream(image) ? captureVideo(image) : onImageDownload(image))}
                      title={isHlsStream(image) ? 'Capture stream' : 'Download'}
                      aria-label={isHlsStream(image) ? 'Capture stream' : 'Download'}
                      className="mbd:grid mbd:h-8 mbd:w-8 mbd:place-items-center mbd:rounded-full mbd:bg-(--brand-ink) mbd:text-white mbd:ring-1 mbd:ring-(--ctl-ring) mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
                    >
                      <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
                    </button>
                  </>
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
            className="mbd:flex mbd:max-h-full mbd:w-full mbd:flex-col mbd:overflow-hidden mbd:rounded-lg mbd:border hairline mbd:bg-(--panel) mbd:shadow-2xl mbd:focus:outline-none"
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
                  <div className="mbd:grid mbd:place-items-center mbd:p-10">
                    <PhotoIcon className="mbd:h-12 mbd:w-12 mbd:text-(--ink-3)" />
                  </div>
                ) : isHlsStream(selectedImage) ? (
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
                <div className="mbd:flex mbd:w-full mbd:gap-2">
                  <button onClick={() => (isHlsStream(selectedImage) ? captureVideo(selectedImage) : onImageDownload(selectedImage))} title={isHlsStream(selectedImage) ? 'Capture stream' : 'Download'} aria-label={isHlsStream(selectedImage) ? 'Capture stream' : 'Download'} className="btn btn-primary mbd:flex-1">
                    <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
                    <span>{isHlsStream(selectedImage) ? 'Capture stream' : 'Download'}</span>
                  </button>
                  {isHlsStream(selectedImage) && onCaptureStream && (
                    <StreamVariantSelect
                      state={streamState(selectedImage)}
                      value={heightBySrc.get(selectedImage.src) ?? null}
                      onEnsure={() => ensureVariants(selectedImage.hlsManifest!, selectedImage.type === 'mpd' ? 'dash' : 'hls')}
                      onChange={(h) => setHeight(selectedImage.src, h)}
                      className="mbd:rounded-md mbd:bg-(--panel) mbd:px-2 mbd:text-[12px] mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring)"
                    />
                  )}
                  {isHlsStream(selectedImage) && onCaptureAudio && (
                    <>
                      <button
                        onClick={() => onCaptureAudio(selectedImage, audioOverride === 'default' ? undefined : audioOverride)}
                        title={`Audio only — ${AUDIO_FORMAT_LABELS[audioOverride === 'default' ? defaultAudioFormat : audioOverride]}`}
                        aria-label="Capture audio only"
                        className="btn btn-ghost"
                      >
                        <AudioIcon className="mbd:h-4 mbd:w-4" />
                        <span>Audio</span>
                      </button>
                      <select
                        value={audioOverride}
                        onChange={(e) => setAudioChoice({ src: selectedSrc, format: e.target.value as AudioFormat | 'default' })}
                        aria-label="Audio format for this capture"
                        title="Audio format for this capture"
                        className="mbd:rounded-md mbd:bg-(--panel) mbd:px-2 mbd:text-[12px] mbd:text-(--ink) mbd:ring-1 mbd:ring-(--ctl-ring)"
                      >
                        <option value="default">Default ({AUDIO_FORMAT_LABELS[defaultAudioFormat]})</option>
                        {AUDIO_FORMATS.map((f) => (
                          <option key={f} value={f}>{AUDIO_FORMAT_LABELS[f]}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageList;
