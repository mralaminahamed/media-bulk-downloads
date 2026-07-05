import React from 'react';
import { CenteredStateProps } from '@/types';

/** Shared centered layout for the empty / error states. */
export const CenteredState: React.FC<CenteredStateProps> = ({ icon, title, body, action, tone = 'neutral' }) => (
  <div className="reveal grid h-full place-items-center text-center">
    <div className="flex max-w-[260px] flex-col items-center gap-3">
      <span
        className={`grid h-12 w-12 place-items-center rounded-lg border hairline bg-(--panel) ${
          tone === 'warning' ? 'text-(--warn)' : 'text-(--ink-3)'
        }`}
      >
        {icon}
      </span>
      <div>
        <p className="text-[13px] font-semibold text-(--ink)">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-(--ink-2)">{body}</p>
      </div>
      {action}
    </div>
  </div>
);
