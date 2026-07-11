import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { EmptyStateProps } from '@/types';
import { CenteredState } from './CenteredState';

export const EmptyState: React.FC<EmptyStateProps> = ({ onRefresh }) => (
  <CenteredState
    icon={
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    }
    title="No media here"
    body="This page has no media that matches your filters. Try another page or rescan."
    action={
      <button onClick={onRefresh} className="btn btn-ghost">
        <ArrowPathIcon className="mbd:h-4 mbd:w-4" />
        <span>Rescan page</span>
      </button>
    }
  />
);
