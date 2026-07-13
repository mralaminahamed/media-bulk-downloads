import React from 'react';
import { BubbleCorner, BubblePanelPlacement, SettingsPaneProps } from '@mbd/core/types';
import { NumberField } from '@/extension/popup/components/fields/NumberField';
import { SelectField } from '@/extension/popup/components/fields/SelectField';
import { ToggleRow } from '@/extension/popup/components/fields/ToggleRow';
import { AdvancedDisclosure } from '@/extension/popup/components/panels/settings/AdvancedDisclosure';

const DisplayPane: React.FC<SettingsPaneProps> = ({
  settings,
  handleChange,
  clampOnBlur,
  toggle,
  setSettings,
  advancedDefaultOpen,
}) => (
  <section
    role="tabpanel"
    id="settings-panel-display"
    aria-labelledby="settings-tab-display"
    className="mbd:space-y-3"
  >
    <NumberField
      id="set-thumbnailSize"
      name="thumbnailSize"
      label="Thumbnail size (px):"
      min={64}
      max={240}
      value={settings.thumbnailSize}
      onChange={handleChange}
      onBlur={clampOnBlur('thumbnailSize', 64, 240)}
    />
    <ToggleRow
      id="set-showImageCount"
      label="Show image count on toolbar icon"
      checked={settings.showImageCount}
      onToggle={() => toggle('showImageCount')}
    />
    <ToggleRow
      id="set-bubbleEnabled"
      label="Show floating bubble on pages"
      checked={settings.bubbleEnabled}
      onToggle={() => toggle('bubbleEnabled')}
    />
    {settings.bubbleEnabled && (
      <>
        <SelectField
          id="set-bubbleCorner"
          name="bubbleCorner"
          label="Bubble corner:"
          value={settings.bubblePosition.corner}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              bubblePosition: { ...prev.bubblePosition, corner: e.target.value as BubbleCorner },
            }))
          }
        >
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="top-right">Top right</option>
          <option value="top-left">Top left</option>
        </SelectField>
        <SelectField
          id="set-bubblePanelPlacement"
          name="bubblePanelPlacement"
          label="Panel position:"
          value={settings.bubblePanelPlacement}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              bubblePanelPlacement: e.target.value as BubblePanelPlacement,
            }))
          }
        >
          <option value="anchored">Next to button</option>
          <option value="center">Center of screen</option>
          <option value="free">Custom (drag panel header)</option>
          <option value="bottom-right">Corner · bottom right</option>
          <option value="bottom-left">Corner · bottom left</option>
          <option value="top-right">Corner · top right</option>
          <option value="top-left">Corner · top left</option>
        </SelectField>
        <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
          Tip: drag the panel by its header on any page to drop it exactly where you want.
        </p>
      </>
    )}
    <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
      Drag the bubble on any page to fine-tune its position. Works everywhere the
      popup can run except restricted pages (chrome://, the Web Store, PDFs).
    </p>

    <AdvancedDisclosure id="adv-display" defaultOpen={advancedDefaultOpen}>
      <div className="mbd:grid mbd:grid-cols-2 mbd:gap-3">
        <NumberField
          id="set-popupWidth"
          name="popupWidth"
          label="Popup width:"
          min={320}
          max={800}
          value={settings.popupWidth}
          onChange={handleChange}
          onBlur={clampOnBlur('popupWidth', 320, 800)}
        />
        <NumberField
          id="set-popupHeight"
          name="popupHeight"
          label="Popup height:"
          min={400}
          max={600}
          value={settings.popupHeight}
          onChange={handleChange}
          onBlur={clampOnBlur('popupHeight', 400, 600)}
        />
      </div>
      <NumberField
        id="set-previewSize"
        name="previewSize"
        label="Preview size (px):"
        min={240}
        max={900}
        value={settings.previewSize}
        onChange={handleChange}
        onBlur={clampOnBlur('previewSize', 240, 900)}
      />
      {settings.bubbleEnabled && (
        <div className="mbd:grid mbd:grid-cols-2 mbd:gap-3">
          <NumberField
            id="set-bubbleWidth"
            name="bubbleWidth"
            label="Bubble width:"
            min={320}
            max={3840}
            value={settings.bubbleWidth}
            onChange={handleChange}
            onBlur={clampOnBlur('bubbleWidth', 320, 3840)}
          />
          <NumberField
            id="set-bubbleHeight"
            name="bubbleHeight"
            label="Bubble height:"
            min={360}
            max={2160}
            value={settings.bubbleHeight}
            onChange={handleChange}
            onBlur={clampOnBlur('bubbleHeight', 360, 2160)}
          />
        </div>
      )}
    </AdvancedDisclosure>
  </section>
);

export default DisplayPane;
