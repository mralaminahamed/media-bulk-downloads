import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSaveAsHintState, markSaveAsPromptSeen, dismissSaveAsHint,
} from '@mbd/storage/save-as-hint';

describe('save-as-hint storage', () => {
  beforeEach(async () => { await chrome.storage.local.clear(); vi.restoreAllMocks(); });

  it('loadSaveAsHintState reflects both flags (defaults false)', async () => {
    expect(await loadSaveAsHintState()).toEqual({ seen: false, dismissed: false });
    await markSaveAsPromptSeen();
    expect(await loadSaveAsHintState()).toMatchObject({ seen: true, dismissed: false });
  });

  it('markSaveAsPromptSeen is set-once (a second call does not write)', async () => {
    await markSaveAsPromptSeen();
    const setSpy = vi.spyOn(chrome.storage.local, 'set');
    setSpy.mockClear(); // Clear inherited call history from the first call
    await markSaveAsPromptSeen();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('dismissSaveAsHint sets the dismissed flag', async () => {
    await dismissSaveAsHint();
    expect(await loadSaveAsHintState()).toMatchObject({ dismissed: true });
  });
});
