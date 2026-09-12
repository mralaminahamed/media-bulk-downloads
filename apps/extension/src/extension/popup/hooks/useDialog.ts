import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Wires an open modal dialog for keyboard and screen-reader users: focuses the
 * panel on open, traps Tab within it, closes on Escape, and restores focus to
 * the previously focused element when it closes. Returns a ref to attach to the
 * dialog panel (also give the panel role="dialog", aria-modal, and tabIndex=-1).
 *
 * `active` lets a caller whose modal mounts/unmounts inline (e.g. an in-place
 * preview) turn the wiring on and off without conditionally calling the hook.
 */
export function useDialog(onClose: () => void, active = true) {
  const ref = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    // In the on-page bubble the panel lives inside a shadow root, where
    // `document.activeElement` returns the shadow HOST, not the focused inner
    // element — so read the active element from the panel's own root node
    // (ShadowRoot or Document). Without this the Tab-trap comparisons never match
    // (focus escapes the modal) and focus-restore captures the host.
    const activeInRoot = (): Element | null => {
      const root = ref.current?.getRootNode() as Document | ShadowRoot | undefined;
      return (root?.activeElement ?? document.activeElement) ?? null;
    };
    const previouslyFocused = activeInRoot() as HTMLElement | null;
    ref.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusables || focusables.length === 0) return;
      const list = Array.from(focusables);
      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = activeInRoot();
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
    // Keyed on `active` only — see onCloseRef above.
  }, [active]);

  return ref;
}
