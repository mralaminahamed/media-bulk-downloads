import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Bubble from '@/extension/bubble/Bubble';
import { collectMedia } from '@/extension/content/collect';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { registrableDomain } from '@mbd/core/collection/paths';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';

// The bubble's collect + deep scan read the EFFECTIVE settings (global + per-host).
// Stub both engines so we can assert the options they receive.
vi.mock('@/extension/content/collect', () => ({ collectMedia: vi.fn(() => []) }));
vi.mock('@/extension/content/deepScanRunner', () => ({ startDeepScan: vi.fn(() => Promise.resolve([])) }));

const base = { ...DEFAULT_SETTINGS, bubbleEnabled: true };
let localStore: Record<string, unknown>;

const openPanel = async () => {
  await act(async () => {
    (chrome.runtime.onMessage.addListener as Mock).mock.calls
      .map((c) => c[0])
      .forEach((fn) => fn('TOGGLE_BUBBLE'));
  });
};

beforeEach(() => {
  localStore = {};
  (collectMedia as Mock).mockClear();
  (startDeepScan as Mock).mockClear();
  (chrome.storage.sync.get as Mock).mockImplementation((_k: unknown, cb: (r: unknown) => void) => cb({}));
  (chrome.storage.local.get as Mock).mockImplementation(async (k: string) => (k in localStore ? { [k]: localStore[k] } : {}));
  document.body.innerHTML = '';
});

describe('Bubble collect/deep-scan honour effective settings', () => {
  it('passes smartPageDefaults + resolveOriginals to collectMedia (were dead no-ops before)', async () => {
    render(<Bubble initialSettings={{ ...base, smartPageDefaults: true, resolveOriginals: true }} />);
    await openPanel();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });

    await waitFor(() => expect(collectMedia).toHaveBeenCalled());
    expect(collectMedia).toHaveBeenCalledWith(undefined, { smartPageDefaults: true, resolveOriginals: true });
  });

  it('applies a per-host override to the bubble deep scan (#293)', async () => {
    // A per-host override lowers the deep-scan item cap far below the global 1000.
    localStore.perHostSettings = { [registrableDomain(location.hostname)]: { deepScanMaxItems: 7 } };
    render(<Bubble initialSettings={{ ...base, deepScanMaxItems: 1000 }} />);
    await openPanel();
    await screen.findByRole('heading', { name: 'Media Bulk Downloads' });
    // Let refreshEffective() layer the override into effectiveRef.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Deep scan' }));

    const config = (startDeepScan as Mock).mock.calls[0][2] as { maxItems: number };
    expect(config.maxItems).toBe(7); // the host override, not the global 1000
  });
});
