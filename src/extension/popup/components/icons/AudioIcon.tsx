import React from 'react';
import { IconProps } from '@mbd/core/types';

/** Placeholder tile icon for audio items. */
export const AudioIcon: React.FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
