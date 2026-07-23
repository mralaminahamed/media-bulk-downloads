import type { DesktopSettings } from '../../lib/settings.ts';
import { NumberField, ToggleRow } from './fields.tsx';

export interface MediaPaneProps {
  settings: DesktopSettings;
  patch: (partial: Partial<DesktopSettings>, debounce?: boolean) => void;
}

export function MediaPane({ settings, patch }: MediaPaneProps) {
  return (
    <div>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Media</h2>

      <NumberField
        label="Minimum image size"
        value={settings.minimumImageSize}
        onChange={(v) => patch({ minimumImageSize: v })}
        min={0}
        hint="Hide images smaller than this, in pixels (0 = no minimum)"
      />

      <ToggleRow
        label="Exclude base64 images"
        checked={settings.excludeBase64Images}
        onChange={(v) => patch({ excludeBase64Images: v })}
        hint="Skip inline data: URI images"
      />

      <ToggleRow
        label="Exclude emoji"
        checked={settings.excludeEmoji}
        onChange={(v) => patch({ excludeEmoji: v })}
        hint="Skip small emoji and icon images"
      />
    </div>
  );
}
