import type { DesktopSettings } from '../../lib/settings.ts';
import { NumberField, SelectField, TextField, ToggleRow } from './fields.tsx';

export interface DownloadsPaneProps {
  settings: DesktopSettings;
  patch: (partial: Partial<DesktopSettings>, debounce?: boolean) => void;
}

const NAMING_OPTIONS = [
  { value: 'original', label: 'Original filename' },
  { value: 'prefixed', label: 'Prefixed filename' },
];

export function DownloadsPane({ settings, patch }: DownloadsPaneProps) {
  return (
    <div>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Downloads</h2>

      <TextField
        label="Download path"
        value={settings.downloadPath}
        onChange={(v) => patch({ downloadPath: v }, true)}
        placeholder="{domain}"
        hint="Path template under your downloads folder, e.g. {domain}"
      />

      <SelectField
        label="File naming"
        value={settings.namingMode}
        options={NAMING_OPTIONS}
        onChange={(v) => patch({ namingMode: v as DesktopSettings['namingMode'] })}
      />

      {settings.namingMode === 'prefixed' && (
        <TextField
          label="File name prefix"
          value={settings.fileNamePrefix}
          onChange={(v) => patch({ fileNamePrefix: v }, true)}
          placeholder="image_"
        />
      )}

      <NumberField
        label="Download concurrency"
        value={settings.downloadConcurrency}
        onChange={(v) => patch({ downloadConcurrency: v })}
        min={1}
        max={10}
        hint="How many downloads run at once (1–10)"
      />

      <ToggleRow
        label="Skip duplicate downloads"
        checked={settings.skipDuplicateDownloads}
        onChange={(v) => patch({ skipDuplicateDownloads: v })}
        hint="Skip files already saved to disk"
      />

      <ToggleRow
        label="Save metadata sidecar"
        checked={settings.metadataSidecar}
        onChange={(v) => patch({ metadataSidecar: v })}
        hint="Write a .json file with source info next to each download"
      />
    </div>
  );
}
