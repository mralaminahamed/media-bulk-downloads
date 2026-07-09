import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/extension/popup/App';
import { isFbPhotoGrid } from '@/extension/shared/active-tab/fb-grid-url';
import {
  captureOriginalsActiveTab,
  abortCaptureOriginalsActiveTab,
} from '@/extension/shared/active-tab/fb-capture-active-tab';
import '@/styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const onGrid = !!tab?.url && isFbPhotoGrid(tab.url);
  root.render(
    <App
      captureOriginals={onGrid ? captureOriginalsActiveTab : undefined}
      abortCaptureOriginals={onGrid ? abortCaptureOriginalsActiveTab : undefined}
    />,
  );
});
