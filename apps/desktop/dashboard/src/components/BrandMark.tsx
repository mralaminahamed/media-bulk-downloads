import { useId } from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Inline SVG brand mark — the indigo tile with the photo card + download
 * arrow, matching `apps/desktop/assets/icon.svg`. No external asset import
 * so it renders inline in the dashboard bundle without a network/file fetch.
 */
export function BrandMark({ size = 32, className }: BrandMarkProps) {
  const uid = useId();
  const tileId = `mbd-tile-${uid}`;
  const sheenId = `mbd-sheen-${uid}`;
  const photoId = `mbd-photo-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ borderRadius: 6, flex: 'none' }}
    >
      <defs>
        <linearGradient id={tileId} x1="12" y1="6" x2="116" y2="122" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818CF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="6" x2="0" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={photoId}>
          <rect x="35" y="23" width="58" height="41" rx="9" />
        </clipPath>
      </defs>

      {/* Brand tile */}
      <rect x="6" y="6" width="116" height="116" rx="28" fill={`url(#${tileId})`} />
      <rect x="6" y="6" width="116" height="116" rx="28" fill={`url(#${sheenId})`} />

      {/* Faint back card = "bulk" (fades out cleanly at small sizes) */}
      <rect x="30" y="17" width="58" height="41" rx="9" fill="#ffffff" opacity="0.28" />

      {/* Front photo card with sun + mountain */}
      <rect x="35" y="23" width="58" height="41" rx="9" fill="#ffffff" />
      <g clipPath={`url(#${photoId})`}>
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
}
