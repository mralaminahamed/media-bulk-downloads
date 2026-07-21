import React from 'react';
import { ChevronDoubleDownIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { FilteredEmptyStateProps } from '@mbd/core/types';
import { CenteredState } from '@/extension/popup/components/states/CenteredState';

/**
 * Shown when the page HAS eligible media but the active toolbar filters hide all
 * of it (e.g. a "not downloaded" filter after everything matching was downloaded).
 * Without this the grid renders blank with no way forward; here we explain the
 * situation and offer the two escapes — clear the filters, or deep-scan for more.
 */
export const FilteredEmptyState: React.FC<FilteredEmptyStateProps> = ({
  hiddenCount,
  allDownloaded,
  deepScanning,
  onClearFilters,
  onDeepScan,
}) => (
  <CenteredState
    icon={<FunnelIcon className="mbd:h-5.5 mbd:w-5.5" aria-hidden="true" />}
    title="Nothing matches your filters"
    body={
      `All ${hiddenCount} ${hiddenCount === 1 ? 'item' : 'items'} on this page are hidden by your active filters.` +
      (allDownloaded ? " You've downloaded everything that matched." : '')
    }
    action={
      <div className="mbd:flex mbd:flex-wrap mbd:justify-center mbd:gap-2">
        <button onClick={onClearFilters} className="btn btn-primary">
          Clear filters
        </button>
        <button onClick={onDeepScan} className="btn btn-ghost">
          <ChevronDoubleDownIcon className={`mbd:h-4 mbd:w-4 ${deepScanning ? 'mbd:animate-pulse' : ''}`} />
          <span>{deepScanning ? 'Stop deep scan' : 'Deep scan'}</span>
        </button>
      </div>
    }
  />
);
