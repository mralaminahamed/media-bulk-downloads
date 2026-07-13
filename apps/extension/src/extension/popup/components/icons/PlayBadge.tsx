import React from 'react';
import { IconProps } from '@mbd/core/types';

/** Centered ▶ badge overlaid on a video thumbnail that has a poster. */
export const PlayBadge: React.FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" />
  </svg>
);
