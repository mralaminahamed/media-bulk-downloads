import React from 'react';
import { DownloadsPaneProps, SettingsData } from '@mbd/core/types';
import { TextField } from '@/extension/popup/components/fields/TextField';
import { NumberField } from '@/extension/popup/components/fields/NumberField';
import { SelectField } from '@/extension/popup/components/fields/SelectField';
import { ToggleRow } from '@/extension/popup/components/fields/ToggleRow';
import { AdvancedDisclosure } from '@/extension/popup/components/panels/settings/AdvancedDisclosure';

const DownloadsPane: React.FC<DownloadsPaneProps> = ({
  settings,
  handleChange,
  clampOnBlur,
  toggle,
  setSettings,
  advancedDefaultOpen,
  folderPreview,
  onNotifyToggle,
  setNaming,
}) => (
  <section
    role="tabpanel"
    id="settings-panel-downloads"
    aria-labelledby="settings-tab-downloads"
    className="mbd:space-y-3"
  >
    <TextField
      id="set-downloadPath"
      name="downloadPath"
      label="Save to subfolder (in Downloads):"
      value={settings.downloadPath}
      onChange={handleChange}
      placeholder="e.g. Media/{domain}"
      hint={folderPreview}
      hintClassName="num mbd:mt-1 mbd:block mbd:text-[11px] mbd:text-(--ink-3)"
    />
    <p className="mbd:mt-1 mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
      Tokens:{' '}
      <code className="num mbd:text-(--ink-2)">{'{host}'}</code>{' '}
      <code className="num mbd:text-(--ink-2)">{'{domain}'}</code>{' '}
      <code className="num mbd:text-(--ink-2)">{'{date}'}</code>{' '}
      <code className="num mbd:text-(--ink-2)">{'{kind}'}</code>{' '}
      — e.g. <code className="num mbd:text-(--ink-2)">Media/{'{domain}'}</code> saves each site to
      its own folder.
    </p>

    <div>
      <span id="naming-label" className="mbd:mb-1 mbd:block mbd:text-[12px] mbd:text-(--ink-2)">
        File naming:
      </span>
      <div className="segwrap" role="group" aria-labelledby="naming-label">
        {(['prefixed', 'original'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setNaming(mode)}
            className={`seg ${settings.namingMode === mode ? 'is-active' : ''}`}
            aria-pressed={settings.namingMode === mode}
          >
            {mode === 'prefixed' ? 'Prefixed' : 'Original'}
          </button>
        ))}
      </div>
    </div>

    {settings.namingMode === 'prefixed' && (
      <TextField
        id="set-fileNamePrefix"
        name="fileNamePrefix"
        label="File name prefix:"
        value={settings.fileNamePrefix}
        onChange={handleChange}
        hint="Numbered per file, e.g. image_1.jpg."
      />
    )}

    <SelectField
      id="set-convert"
      name="convertImagesTo"
      label="Convert images on download to:"
      value={settings.convertImagesTo}
      onChange={(e) =>
        setSettings((prev) => ({ ...prev, convertImagesTo: e.target.value as SettingsData['convertImagesTo'] }))
      }
    >
      <option value="off">Keep original format</option>
      <option value="png">PNG</option>
      <option value="jpeg">JPEG</option>
    </SelectField>
    <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
      Re-encodes raster images (incl. WebP/AVIF) to your chosen format as they download.
      Videos, audio, SVGs, and GIFs are always saved as-is.
    </p>

    {settings.convertImagesTo !== 'off' && (
      <>
        <SelectField
          id="set-convert-metadata"
          name="convertMetadata"
          label="Metadata when converting:"
          value={settings.convertMetadata}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, convertMetadata: e.target.value as SettingsData['convertMetadata'] }))
          }
        >
          <option value="preserve">Preserve (copy EXIF/XMP)</option>
          <option value="strip">Strip (remove all metadata)</option>
        </SelectField>
        <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
          Preserve copies embedded EXIF/XMP (copyright, author, capture info) across the
          re-encode. Strip removes it — useful for clearing GPS/location before sharing.
        </p>
      </>
    )}

    {/* Stream capture is Chrome-only (offscreen assembly), so the rendition
        preference is only shown where it can take effect. */}
    {!import.meta.env.FIREFOX && (
      <>
        <SelectField
          id="set-streamQuality"
          name="streamQuality"
          label="Stream capture quality:"
          value={settings.streamQuality}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, streamQuality: e.target.value as SettingsData['streamQuality'] }))
          }
        >
          <option value="auto">Auto (recommended)</option>
          <option value="best">Best available</option>
          <option value="1080">1080p</option>
          <option value="720">720p</option>
          <option value="480">480p</option>
          <option value="worst">Smallest (data saver)</option>
        </SelectField>
        <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
          Which rendition to capture from a multi-quality HLS/DASH stream. A fixed
          resolution picks the closest the stream offers; single-quality streams ignore this.
        </p>
      </>
    )}

    <ToggleRow
      id="set-saveAs"
      label="Ask where to save each file"
      checked={settings.saveAs}
      onToggle={() => toggle('saveAs')}
    />
    <ToggleRow
      id="set-metadataSidecar"
      label="Save metadata sidecar (.json)"
      description="Write a sibling <name>.json next to each download with its source URL, page, alt text, and dimensions — provenance for archiving. Off by default; offline, no extra network."
      checked={settings.metadataSidecar}
      onToggle={() => toggle('metadataSidecar')}
    />

    <AdvancedDisclosure id="adv-downloads" defaultOpen={advancedDefaultOpen}>
      <NumberField
        id="set-downloadConcurrency"
        name="downloadConcurrency"
        label="Simultaneous downloads:"
        min={1}
        max={10}
        value={settings.downloadConcurrency}
        onChange={handleChange}
        onBlur={clampOnBlur('downloadConcurrency', 1, 10)}
      />
      <NumberField
        id="set-nearDuplicateThreshold"
        name="nearDuplicateThreshold"
        label="Near-duplicate similarity threshold:"
        min={2}
        max={16}
        value={settings.nearDuplicateThreshold}
        onChange={handleChange}
        onBlur={clampOnBlur('nearDuplicateThreshold', 2, 16)}
      />
      <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
        Lower = stricter (fewer images treated as duplicates). Used by the “Find
        near-duplicates” action in the header, which fetches and hashes images to
        collapse the same picture served at different sizes. Default 8.
      </p>
      <ToggleRow
        id="set-notify"
        label="Notify when downloads finish"
        description="Show a desktop notification with the result of each download batch — handy for keyboard-shortcut and right-click downloads. Asks for notification permission the first time."
        checked={settings.notifyOnComplete}
        onToggle={onNotifyToggle}
      />
    </AdvancedDisclosure>
  </section>
);

export default DownloadsPane;
