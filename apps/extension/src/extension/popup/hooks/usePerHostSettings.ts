import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsData } from '@mbd/core/types';
import { hostFromUrl, registrableDomain } from '@mbd/core/collection/paths';
import {
  applyHostOverride, pickHostFields, overrideForHost, loadEffectiveSettingsForHost,
} from '@mbd/storage/per-host-settings';
import { sendRuntimeMessage } from '../utils';

export interface UsePerHostSettingsResult {
  /** The active page's registrable domain; '' when unknown (no active tab). */
  host: string;
  /** Whether a stored override exists for this host. */
  hasOverride: boolean;
  /** The host's allowlisted override ({} when none). */
  override: Partial<SettingsData>;
  /** global settings with this host's override applied (drives the engine). */
  effective: SettingsData;
  /** Live mirror of `effective` for stale-closure-free async reads. */
  effectiveRef: RefObject<SettingsData>;
  /** Fresh global + override load, merged — seeds the engine's first scan. */
  loadEffective: () => Promise<SettingsData>;
  /** Snapshot the allowlisted fields of `from` (the dialog's current values) into
   *  this host's override. No-op when host is unknown. */
  saveForThisSite: (from: SettingsData) => void;
  /** Clear this host's override entirely. */
  resetThisSite: () => void;
}

/**
 * Owns the per-host override layer for the active page (#293). The Settings
 * dialog keeps editing the GLOBAL layer (`globalSettings`); this hook derives the
 * effective settings the media engine and convert path consume, and exposes the
 * Save/Reset actions. Writes route through the background (SET_PER_HOST_SETTINGS,
 * single serialized writer) and update local state optimistically.
 */
export function usePerHostSettings(
  currentSourcePage: () => Promise<{ url: string }>,
  globalSettings: SettingsData,
): UsePerHostSettingsResult {
  const [host, setHost] = useState('');
  const [override, setOverride] = useState<Partial<SettingsData>>({});

  useEffect(() => {
    void currentSourcePage().then(async ({ url }) => {
      const h = registrableDomain(hostFromUrl(url));
      setHost(h);
      setOverride(await overrideForHost(h));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effective = useMemo(() => applyHostOverride(globalSettings, override), [globalSettings, override]);
  const effectiveRef = useRef(effective);
  useEffect(() => { effectiveRef.current = effective; }, [effective]);

  const loadEffective = useCallback(async () => {
    const { url } = await currentSourcePage();
    return loadEffectiveSettingsForHost(hostFromUrl(url));
    // currentSourcePage is stable (defined in App render scope); deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveForThisSite = useCallback((from: SettingsData) => {
    if (!host) return;
    const patch = pickHostFields(from);
    if (Object.keys(patch).length === 0) return;
    sendRuntimeMessage({ type: 'SET_PER_HOST_SETTINGS', host, patch });
    setOverride(patch);
  }, [host]);

  const resetThisSite = useCallback(() => {
    if (!host) return;
    sendRuntimeMessage({ type: 'SET_PER_HOST_SETTINGS', host, patch: null });
    setOverride({});
  }, [host]);

  return {
    host,
    hasOverride: Object.keys(override).length > 0,
    override,
    effective,
    effectiveRef,
    loadEffective,
    saveForThisSite,
    resetThisSite,
  };
}
