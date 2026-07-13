import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { useSettings } from '@/extension/popup/hooks/useSettings';

describe('useSettings', () => {
  beforeEach(() => { (chrome.storage.sync.get as Mock).mockReset(); });

  it('loads the persisted global settings on mount', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_k: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: { minimumImageSize: 321 } }),
    );
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.minimumImageSize).toBe(321));
    expect(result.current.settingsRef.current.minimumImageSize).toBe(321);
  });
});
