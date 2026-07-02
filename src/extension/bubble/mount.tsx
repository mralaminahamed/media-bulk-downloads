import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SettingsData } from '@/types';
import Bubble from './Bubble';
// Compiled app CSS as a string, injected into the Shadow DOM so the page's
// styles can't leak in and ours can't leak out.
import styles from '@/styles/index.css?inline';

const HOST_ID = 'ibd-bubble-host';

export interface BubbleController {
  unmount: () => void;
}

/** Mounts the on-page bubble into an isolated Shadow DOM host. */
export function mountBubble(settings: SettingsData): BubbleController {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  // Neutralize inherited page styles on the host element itself.
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; inset: 0 auto auto 0; width: 0; height: 0;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root: Root = createRoot(mountPoint);
  root.render(
    <React.StrictMode>
      <Bubble initialSettings={settings} />
    </React.StrictMode>,
  );

  return {
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}
