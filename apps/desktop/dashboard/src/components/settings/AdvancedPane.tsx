import type { DesktopSettings } from '../../lib/settings.ts';
import { NumberField, ToggleRow } from './fields.tsx';

export interface AdvancedPaneProps {
  settings: DesktopSettings;
  patch: (partial: Partial<DesktopSettings>, debounce?: boolean) => void;
}

export function AdvancedPane({ settings, patch }: AdvancedPaneProps) {
  return (
    <div>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Advanced</h2>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
        Some of these settings are used by upcoming deep-scan and duplicate-detection features and have
        no visible effect yet — they're saved now so those features can pick them up later.
      </p>

      <ToggleRow
        label="Smart page defaults"
        checked={settings.smartPageDefaults}
        onChange={(v) => patch({ smartPageDefaults: v })}
        hint="Automatically pick scan behaviour based on the site"
      />

      <ToggleRow
        label="Remember scan behaviour"
        checked={settings.rememberScanBehaviour}
        onChange={(v) => patch({ rememberScanBehaviour: v })}
        hint="Reuse your last scan choice per site"
      />

      <NumberField
        label="Deep scan max items"
        value={settings.deepScanMaxItems}
        onChange={(v) => patch({ deepScanMaxItems: v }, true)}
        min={1}
        hint="Stop a deep scan after this many items"
      />

      <NumberField
        label="Deep scan max seconds"
        value={settings.deepScanMaxSeconds}
        onChange={(v) => patch({ deepScanMaxSeconds: v }, true)}
        min={1}
        hint="Stop a deep scan after this many seconds"
      />

      <NumberField
        label="Deep scan max scrolls"
        value={settings.deepScanMaxScrolls}
        onChange={(v) => patch({ deepScanMaxScrolls: v }, true)}
        min={1}
        hint="Stop a deep scan after this many auto-scrolls"
      />

      <ToggleRow
        label="Click 'load more' buttons during deep scan"
        checked={settings.deepScanClickLoadMore}
        onChange={(v) => patch({ deepScanClickLoadMore: v })}
        hint="Also click load-more/show-more buttons while scrolling"
      />

      <NumberField
        label="Near-duplicate threshold"
        value={settings.nearDuplicateThreshold}
        onChange={(v) => patch({ nearDuplicateThreshold: v }, true)}
        min={2}
        max={16}
        hint="Hamming distance below which images count as near-duplicates (2–16)"
      />
    </div>
  );
}
