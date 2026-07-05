import React from 'react';
import { SkeletonGridProps } from '@/types';

/**
 * Scanning state — a skeleton grid that mirrors the real thumbnail layout, so
 * the switch to loaded images doesn't shift the page. A small "Scanning" hint
 * keeps the branded scanning language.
 */
export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ thumbnailSize }) => (
  <div className="reveal">
    <p className="eyebrow mb-2.5 text-center">Scanning page…</p>
    <div
      className="grid justify-center gap-2.5"
      style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-(--radius) border hairline bg-(--panel)">
          <div className="skeleton aspect-square" />
          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
            <span className="skeleton h-2.5 w-10 rounded-[3px]" />
            <span className="skeleton h-2.5 w-7 rounded-[3px]" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
