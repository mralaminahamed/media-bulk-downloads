import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { SettingsData } from '@/types';
import { DEFAULT_SETTINGS, withDefaults } from '../../shared/storage/settings';
import { sendRuntimeMessage } from '../utils';

export interface UseSettingsResult {
  settings: SettingsData;
  setSettings: Dispatch<SetStateAction<SettingsData>>;
  settingsRef: RefObject<SettingsData>;
  handleSettingsChange: (newSettings: SettingsData) => void;
}

/**
 * Tracks the extension's settings and keeps them live while the popup is
 * open. `settingsRef` mirrors the latest value for synchronous reads from
 * async callbacks (the mount scan, the scan/resolution engine) without a
 * stale closure.
 *
 * The sync-storage 'settings' listener below must be registered between the
 * favourites and excluded local listeners (App calls this hook at that
 * position) so all three keep their positional order in tests.
 */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);

  // Latest settings, readable from async callbacks (the mount scan) without a
  // stale closure.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    // Keep settings live while the popup is open. The on-page bubble persists
    // bubbleWidth/height/placement on resize/drag; without this the popup's
    // one-time snapshot would clobber those the next time the user saves Settings.
    // Mirrors the bubble's own sync listener. Registered between the favourites
    // and excluded local listeners so both keep their positional order in tests.
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'sync' || !changes.settings) return;
      const next = withDefaults(changes.settings.newValue as Partial<SettingsData>);
      settingsRef.current = next;
      setSettings(next);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // The popup owns the form's fields. Persist through the background's single
  // serialized writer (SET_SETTINGS) so a concurrent on-page-bubble drag can't
  // clobber this save. Send a patch WITHOUT the drag-only bubble fields (the
  // button's x/y offset and the freeform panel point, which have no Settings
  // control) so the background's deep-merge preserves them.
  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    const { bubblePosition, bubblePanelPoint, ...rest } = newSettings;
    void bubblePanelPoint; // drag-only; not sent so the stored value is preserved
    sendRuntimeMessage({
      type: 'SET_SETTINGS',
      patch: { ...rest, bubblePosition: { corner: bubblePosition.corner } },
    });
  };

  return { settings, setSettings, settingsRef, handleSettingsChange };
}
