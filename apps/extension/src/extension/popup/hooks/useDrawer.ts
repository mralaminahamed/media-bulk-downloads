import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimationEvent as ReactAnimationEvent } from 'react';
import { useDialog } from '@/extension/popup/hooks/useDialog';

// Longest of the .drawer-out / .overlay-out durations in index.css, plus slack —
// a safety net so the panel still unmounts if `animationend` never lands (the
// element was detached, the animation was interrupted, etc.).
const EXIT_MS = 320;

/**
 * Entrance + exit choreography for the right-side drawer panels (Settings,
 * Favourites, Excluded, History, Tab picker). On mount the panel slides in
 * (.drawer-in). Callers close via the returned `requestClose` — which plays the
 * reverse slide (.drawer-out + .overlay-out scrim fade) and defers the real
 * `onClose` until the slide finishes, so the panel animates out instead of
 * vanishing. `onClose` still fires exactly once.
 *
 * Wraps useDialog (focus trap + Escape), routing Escape through the same
 * animated close.
 *
 * When motion is reduced — or `matchMedia` is unavailable (jsdom under test) —
 * the exit is skipped and `onClose` fires synchronously, keeping close behaviour
 * instant where animation can't or shouldn't run.
 */
export function useDrawer(onClose: () => void) {
  const [closing, setClosing] = useState(false);

  // onClose fires exactly once, whichever path (animationend / timeout / instant)
  // gets there first.
  const done = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onCloseRef.current();
  }, []);

  const requestClose = useCallback(() => {
    const reduced =
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      finish();
      return;
    }
    setClosing(true);
  }, [finish]);

  // Safety net for the deferred close (see EXIT_MS).
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(finish, EXIT_MS);
    return () => clearTimeout(t);
  }, [closing, finish]);

  const ref = useDialog(requestClose);

  const onAnimationEnd = useCallback(
    (e: ReactAnimationEvent) => {
      // Only the drawer's own slide-out ends the panel — ignore descendant
      // animations bubbling up, and the entrance (closing === false).
      if (closing && e.target === e.currentTarget) finish();
    },
    [closing, finish],
  );

  return {
    ref,
    closing,
    requestClose,
    onAnimationEnd,
    scrimClass: closing ? 'overlay-out' : 'overlay-in',
    drawerClass: closing ? 'drawer-out' : 'drawer-in',
  };
}
