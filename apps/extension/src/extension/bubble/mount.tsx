import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SettingsData } from '@mbd/core/types';
import Bubble from '@/extension/bubble/Bubble';
// Compiled app CSS as a string, injected into the Shadow DOM so the page's
// styles can't leak in and ours can't leak out.
import styles from '@/styles/index.css?inline';

export const HOST_ID = 'mbd-bubble-host';
const PROP_STYLE_ID = 'mbd-tw-properties';

export interface BubbleController {
  unmount: () => void;
}

/**
 * Tailwind v4 declares its internal `--tw-*` variables with `@property` rules
 * (initial values like `border-style: solid`, and empty `0 0 #0000` ring/shadow
 * layers). `@property` only registers at the document level — it is inert inside
 * a Shadow DOM `<style>`. Because our whole UI lives in a shadow root, without
 * this every `border`, `shadow-*`, and `ring-*` utility silently loses its
 * default: `border-style` falls back to `none` (which forces the used width to
 * 0), and the shadow/ring shorthands go invalid (→ `none`) — dropping the panel
 * outline, its elevation, the header divider, and the checkbox rings on the
 * bubble surface (all fine in the popup, which is a normal document).
 *
 * Registering just the `@property` rules once in the page's <head> makes them
 * apply inside the shadow tree too. This registers custom-property *names* only;
 * it sets no values on any page element, so nothing of ours becomes visible on
 * the host page — the visual isolation the shadow root gives us is preserved.
 */
function registerTailwindProperties(): void {
  if (document.getElementById(PROP_STYLE_ID)) return;
  const propRules = styles.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g);
  if (!propRules) return;
  const el = document.createElement('style');
  el.id = PROP_STYLE_ID;
  el.textContent = propRules.join('\n');
  (document.head ?? document.documentElement).appendChild(el);
}

/** Mounts the on-page bubble into an isolated Shadow DOM host. */
export function mountBubble(settings: SettingsData): BubbleController {
  document.getElementById(HOST_ID)?.remove();

  // Make Tailwind's @property defaults available inside the shadow DOM (see above).
  registerTailwindProperties();

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
