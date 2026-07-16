import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  loadSaveAsHintState, dismissSaveAsHint,
  SAVE_AS_PROMPT_SEEN_KEY, SAVE_AS_HINT_DISMISSED_KEY,
} from '@mbd/storage/save-as-hint';

/**
 * One-time hint shown after Chrome prompts for a save location (its
 * "Ask where to save each file" pref is on — which the extension can't
 * override). Reads the flags reactively from storage.local; renders nothing
 * until a download is cancelled at the dialog, and nothing once dismissed.
 *
 * The "Open download settings" button uses `chrome.tabs`, which is undefined in
 * the content-script (bubble) surface — and its `chrome://settings/downloads`
 * target can't be opened via the http(s)-only OPEN_URL relay — so the button is
 * shown only in the popup. The hint text (the actionable part) still shows in the
 * bubble.
 */
export function SaveAsPromptHint({ surface = 'popup' }: { surface?: 'popup' | 'bubble' }) {
  const [{ seen, dismissed }, setState] = useState({ seen: false, dismissed: false });

  useEffect(() => {
    let alive = true;
    void loadSaveAsHintState().then((s) => { if (alive) setState(s); });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes[SAVE_AS_PROMPT_SEEN_KEY] || changes[SAVE_AS_HINT_DISMISSED_KEY])) {
        void loadSaveAsHintState().then((s) => { if (alive) setState(s); });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => { alive = false; chrome.storage.onChanged.removeListener(onChanged); };
  }, []);

  if (!seen || dismissed) return null;

  return (
    <section className="mbd:border-t hairline mbd:bg-(--panel) mbd:px-4 mbd:py-2.5 mbd:text-[11px] mbd:text-(--ink-2)" aria-label="Save-As prompt hint">
      <div className="mbd:flex mbd:items-start mbd:gap-2">
        <p className="mbd:min-w-0 mbd:flex-1">
          Chrome is asking where to save each file. Turn off{' '}
          <strong className="mbd:text-(--ink)">&ldquo;Ask where to save each file before downloading&rdquo;</strong>{' '}
          in Chrome&rsquo;s download settings for silent saves.
        </p>
        <button
          type="button" aria-label="Dismiss" title="Dismiss"
          onClick={() => void dismissSaveAsHint()}
          className="mbd:grid mbd:h-5 mbd:w-5 mbd:shrink-0 mbd:place-items-center mbd:rounded mbd:text-(--ink-3) mbd:hover:bg-(--panel-2) mbd:hover:text-(--ink)"
        >
          <XMarkIcon className="mbd:h-3.5 mbd:w-3.5" />
        </button>
      </div>
      {surface === 'popup' && (
        <button
          type="button"
          onClick={() => chrome.tabs.create({ url: 'chrome://settings/downloads' })}
          className="mbd:mt-1.5 mbd:rounded mbd:px-1.5 mbd:py-0.5 mbd:text-(--brand-ink) mbd:hover:underline"
        >
          Open download settings
        </button>
      )}
    </section>
  );
}
