import React from 'react';
import { SkeletonGridProps } from '@/types';

/**
 * Scanning state — a skeleton grid that mirrors the real thumbnail layout, so
 * the switch to loaded images doesn't shift the page. A small "Scanning" hint
 * keeps the branded scanning language.
 */
export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ thumbnailSize }) => (
  <div className="reveal">
    <p className="eyebrow mbd:mb-2.5 mbd:text-center">Scanning page…</p>
    <div
      className="mbd:grid mbd:justify-center mbd:gap-2.5"
      style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="mbd:overflow-hidden mbd:rounded-(--radius) mbd:border hairline mbd:bg-(--panel)">
          <div className="skeleton mbd:aspect-square" />
          <div className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-1 mbd:px-2 mbd:py-1.5">
            <span className="skeleton mbd:h-2.5 mbd:w-10 mbd:rounded-[3px]" />
            <span className="skeleton mbd:h-2.5 mbd:w-7 mbd:rounded-[3px]" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
