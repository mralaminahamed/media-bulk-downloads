/**
 * Two `storage.local` flags backing the popup's one-time "Chrome is asking where
 * to save each file" hint. `saveAsPromptSeen` is set by the background when a
 * download is cancelled at the OS Save-As dialog (USER_CANCELED); the popup shows
 * the hint while it's set and not yet dismissed, and sets `...HintDismissed` when
 * the user dismisses it. Both are on-device only.
 */
export const SAVE_AS_PROMPT_SEEN_KEY = 'saveAsPromptSeen';
export const SAVE_AS_HINT_DISMISSED_KEY = 'saveAsPromptHintDismissed';

export interface SaveAsHintState {
  seen: boolean;
  dismissed: boolean;
}

export async function loadSaveAsHintState(): Promise<SaveAsHintState> {
  const raw = await chrome.storage.local.get([SAVE_AS_PROMPT_SEEN_KEY, SAVE_AS_HINT_DISMISSED_KEY]);
  return { seen: raw[SAVE_AS_PROMPT_SEEN_KEY] === true, dismissed: raw[SAVE_AS_HINT_DISMISSED_KEY] === true };
}

/** Flag that Chrome prompted for a save location — set-once (skip a redundant write). */
export async function markSaveAsPromptSeen(): Promise<void> {
  const raw = await chrome.storage.local.get(SAVE_AS_PROMPT_SEEN_KEY);
  if (raw[SAVE_AS_PROMPT_SEEN_KEY] === true) return;
  await chrome.storage.local.set({ [SAVE_AS_PROMPT_SEEN_KEY]: true });
}

export async function dismissSaveAsHint(): Promise<void> {
  await chrome.storage.local.set({ [SAVE_AS_HINT_DISMISSED_KEY]: true });
}
