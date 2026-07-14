import React from 'react';
import { CenteredStateProps } from '@mbd/core/types';

/** Shared centered layout for the empty / error states. */
export const CenteredState: React.FC<CenteredStateProps> = ({ icon, title, body, action, tone = 'neutral' }) => (
  <div className="reveal mbd:grid mbd:h-full mbd:place-items-center mbd:text-center">
    <div className="mbd:flex mbd:max-w-[260px] mbd:flex-col mbd:items-center mbd:gap-3">
      <span
        className={`mbd:grid mbd:h-12 mbd:w-12 mbd:place-items-center mbd:rounded-lg mbd:border hairline mbd:bg-(--panel) ${
          tone === 'warning' ? 'mbd:text-(--warn)' : 'mbd:text-(--ink-3)'
        }`}
      >
        {icon}
      </span>
      <div>
        <p className="mbd:text-[13px] mbd:font-semibold mbd:text-(--ink)">{title}</p>
        <p className="mbd:mt-1 mbd:text-[12px] mbd:leading-relaxed mbd:text-(--ink-2)">{body}</p>
      </div>
      {action}
    </div>
  </div>
);
