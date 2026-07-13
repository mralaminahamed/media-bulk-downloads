import React from 'react';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ErrorStateProps } from '@mbd/core/types';
import { CenteredState } from './CenteredState';

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <CenteredState
    tone="warning"
    icon={<ExclamationTriangleIcon className="mbd:h-[22px] mbd:w-[22px]" />}
    title="Can't read this page"
    body={message.replace(/^Can't read this page:\s*/i, '') || 'Some pages (chrome://, the Web Store, PDFs) are restricted and can\'t be scanned.'}
    action={
      <button onClick={onRetry} className="btn btn-ghost">
        <ArrowPathIcon className="mbd:h-4 mbd:w-4" />
        <span>Try again</span>
      </button>
    }
  />
);
