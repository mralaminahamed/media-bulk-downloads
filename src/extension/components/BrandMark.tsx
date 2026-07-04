import React, { useId } from 'react';

interface BrandMarkProps {
  /** Rendered edge length in px (the artwork is a square, viewBox 0 0 128 128). */
  size?: number;
  className?: string;
  /** Accessible label; pass `''`/omit and set `aria-hidden` on a wrapper for decorative use. */
  title?: string;
}

/**
 * The extension's brand mark — the exact artwork of the installed toolbar icon
 * (`src/public/icon/*.png`, rasterized from `assets/icon.svg`). This is the
 * single source of truth for every in-app icon (popup header, on-page bubble
 * launcher), so they can never drift from the icon users see in the browser.
 *
 * Keep this artwork in sync with `assets/icon.svg` if the icon is ever redesigned.
 * Gradient/clip IDs are per-instance (`useId`) so multiple marks on one page
 * (or in one Shadow DOM) never collide.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28, className, title }) => {
  const uid = useId();
  const tile = `${uid}-tile`;
  const sheen = `${uid}-sheen`;
  const photo = `${uid}-photo`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title ?? 'Media Bulk Downloads'}
    >
      <defs>
        <linearGradient id={tile} x1="12" y1="6" x2="116" y2="122" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818CF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="6" x2="0" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={photo}>
          <rect x="35" y="23" width="58" height="41" rx="9" />
        </clipPath>
      </defs>

      {/* Brand tile */}
      <rect x="6" y="6" width="116" height="116" rx="28" fill={`url(#${tile})`} />
      <rect x="6" y="6" width="116" height="116" rx="28" fill={`url(#${sheen})`} />

      {/* Faint back card = "bulk" */}
      <rect x="30" y="17" width="58" height="41" rx="9" fill="#ffffff" opacity="0.28" />

      {/* Front photo card: sun + mountain */}
      <rect x="35" y="23" width="58" height="41" rx="9" fill="#ffffff" />
      <g clipPath={`url(#${photo})`}>
        <circle cx="51" cy="38" r="6" fill="#4F46E5" />
        <path d="M39 64 L56 44 L68 56 L82 40 L98 64 Z" fill="#6366F1" />
      </g>

      {/* Download arrow */}
      <g stroke="#ffffff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M64 74 V101" />
        <path d="M48 86 L64 103 L80 86" />
      </g>
    </svg>
  );
};

export default BrandMark;
