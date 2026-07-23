import type { DesktopSettings } from '../../lib/settings.ts';
import { NumberField } from './fields.tsx';

export interface DisplayPaneProps {
  settings: DesktopSettings;
  patch: (partial: Partial<DesktopSettings>, debounce?: boolean) => void;
}

export function DisplayPane({ settings, patch }: DisplayPaneProps) {
  return (
    <div>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Display</h2>

      <NumberField
        label="Thumbnail size"
        value={settings.thumbnailSize}
        onChange={(v) => patch({ thumbnailSize: v }, true)}
        min={96}
        max={320}
        hint="Grid tile size in pixels (96–320)"
      />

      <NumberField
        label="Preview size"
        value={settings.previewSize}
        onChange={(v) => patch({ previewSize: v }, true)}
        min={320}
        max={1200}
        hint="Max preview image edge in pixels (320–1200)"
      />
    </div>
  );
}
