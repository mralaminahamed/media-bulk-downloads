import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  loadSaveAsHintState, dismissSaveAsHint,
  SAVE_AS_PROMPT_SEEN_KEY, SAVE_AS_HINT_DISMISSED_KEY,
} from '@/extension/shared/storage/save-as-hint';

/**
 * One-time hint shown after Chrome prompts for a save location (its
 * "Ask where to save each file" pref is on — which the extension can't
 * override). Reads the flags reactively from storage.local; renders nothing
 * until a download is cancelled at the dialog, and nothing once dismissed.
 */
export function SaveAsPromptHint() {
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
    <section className="border-t hairline bg-(--panel) px-4 py-2.5 text-[11px] text-(--ink-2)" aria-label="Save-As prompt hint">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1">
          Chrome is asking where to save each file. Turn off{' '}
          <strong className="text-(--ink)">&ldquo;Ask where to save each file before downloading&rdquo;</strong>{' '}
          in Chrome&rsquo;s download settings for silent saves.
        </p>
        <button
          type="button" aria-label="Dismiss" title="Dismiss"
          onClick={() => void dismissSaveAsHint()}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-(--ink-3) hover:bg-(--panel-2) hover:text-(--ink)"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => chrome.tabs.create({ url: 'chrome://settings/downloads' })}
        className="mt-1.5 rounded px-1.5 py-0.5 text-(--brand-ink) hover:underline"
      >
        Open download settings
      </button>
    </section>
  );
}
