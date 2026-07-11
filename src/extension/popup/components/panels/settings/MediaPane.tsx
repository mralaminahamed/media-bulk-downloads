import React from 'react';
import { SettingsPaneProps } from '@/types';
import { NumberField } from '../../fields/NumberField';
import { ToggleRow } from '../../fields/ToggleRow';
import { AdvancedDisclosure } from './AdvancedDisclosure';

const MediaPane: React.FC<SettingsPaneProps> = ({
  settings,
  handleChange,
  clampOnBlur,
  toggle,
  advancedDefaultOpen,
}) => (
  <section
    role="tabpanel"
    id="settings-panel-media"
    aria-labelledby="settings-tab-media"
    className="mbd:space-y-3"
  >
    <NumberField
      id="set-minimumImageSize"
      name="minimumImageSize"
      label="Minimum image size (px):"
      min={0}
      max={10000}
      value={settings.minimumImageSize}
      onChange={handleChange}
      onBlur={clampOnBlur('minimumImageSize', 0, 10000)}
    />
    <ToggleRow
      id="set-excludeBase64Images"
      label="Exclude Base64 images"
      checked={settings.excludeBase64Images}
      onToggle={() => toggle('excludeBase64Images')}
    />
    <ToggleRow
      id="set-excludeEmoji"
      label="Exclude emoji"
      description="Hide emoji graphics (Twitter/WordPress twemoji, etc.) from results."
      checked={settings.excludeEmoji}
      onToggle={() => toggle('excludeEmoji')}
    />
    <ToggleRow
      id="set-resolveOriginals"
      label="Resolve exact originals (network requests)"
      description="Fetches Twitter videos and exact Wallhaven/Unsplash originals. Off by default — keeps collection private."
      checked={settings.resolveOriginals}
      onToggle={() => toggle('resolveOriginals')}
    />
    <ToggleRow
      id="set-captureHlsStreams"
      label="Capture video streams (HLS & DASH)"
      description="Surfaces .m3u8 and .mpd streams as capture items. Off by default — capturing fetches and assembles every segment, which is slow and memory-heavy."
      checked={settings.captureHlsStreams}
      onToggle={() => toggle('captureHlsStreams')}
    />

    <AdvancedDisclosure id="adv-media" defaultOpen={advancedDefaultOpen}>
      <div className="mbd:grid mbd:grid-cols-2 mbd:gap-3">
        <NumberField
          id="set-deepScanMaxItems"
          name="deepScanMaxItems"
          label="Max items:"
          min={50}
          max={5000}
          value={settings.deepScanMaxItems}
          onChange={handleChange}
          onBlur={clampOnBlur('deepScanMaxItems', 50, 5000)}
        />
        <NumberField
          id="set-deepScanMaxSeconds"
          name="deepScanMaxSeconds"
          label="Max time (seconds):"
          min={5}
          max={120}
          value={settings.deepScanMaxSeconds}
          onChange={handleChange}
          onBlur={clampOnBlur('deepScanMaxSeconds', 5, 120)}
        />
      </div>
      <NumberField
        id="set-deepScanMaxScrolls"
        name="deepScanMaxScrolls"
        label="Max scroll steps:"
        min={5}
        max={200}
        value={settings.deepScanMaxScrolls}
        onChange={handleChange}
        onBlur={clampOnBlur('deepScanMaxScrolls', 5, 200)}
      />
      <ToggleRow
        id="set-deepScanClickLoadMore"
        label="Click “Load more” buttons"
        description="Lets deep scan click Load more / Show more buttons to reveal more media. Off by default — clicking page controls can have side effects."
        checked={settings.deepScanClickLoadMore}
        onToggle={() => toggle('deepScanClickLoadMore')}
      />
    </AdvancedDisclosure>
  </section>
);

export default MediaPane;
