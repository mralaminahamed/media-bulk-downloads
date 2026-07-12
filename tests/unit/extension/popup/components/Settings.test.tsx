import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '@/extension/popup/components/panels/Settings';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { SettingsData } from '@/types';

describe('Settings Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSettingsChange = vi.fn();
  const initialSettings: SettingsData = {
    downloadPath: 'downloads',
    fileNamePrefix: 'image_',
    // Matches DEFAULT_SETTINGS.popupWidth so this fixture doesn't itself count as
    // "non-default" — the Display pane's Advanced section should start collapsed
    // unless a test deliberately overrides one of its fields.
    popupWidth: 460,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
    saveAs: false,
    notifyOnComplete: false,
    convertImagesTo: 'off',
    convertMetadata: 'preserve',
    namingMode: 'prefixed' as const,
    thumbnailSize: 120,
    previewSize: 360,
    bubbleEnabled: false,
    bubblePosition: { corner: 'bottom-right' as const, x: 20, y: 20 },
    bubbleWidth: 440,
    bubbleHeight: 560,
    bubblePanelPlacement: 'anchored' as const,
    bubblePanelPoint: { x: 40, y: 40 },
    resolveOriginals: false,
    captureHlsStreams: false,
    downloadConcurrency: 5,
    excludeEmoji: false,
    deepScanMaxItems: 1000,
    deepScanMaxSeconds: 20,
    deepScanMaxScrolls: 40,
    deepScanClickLoadMore: false,
    smartPageDefaults: false,
  };

  // jsdom does not implement
  // Blob/File.prototype.text, which handleImportBackup relies on. Polyfill it via
  // FileReader (which jsdom does implement) so uploaded backup files can be read.
  beforeAll(() => {
    if (typeof Blob.prototype.text !== 'function') {
      (Blob.prototype as { text: () => Promise<string> }).text = function (): Promise<string> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(this as Blob);
        });
      };
    }
  });

  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnSettingsChange.mockClear();
    // These global chrome mocks are shared across the suite and are not
    // auto-reset between tests; clear them so per-test assertions are precise.
    (chrome.runtime.sendMessage as Mock).mockClear();
    (chrome.permissions.request as Mock).mockReset();
  });

  // ── Tab / Advanced navigation helpers ───────────────────────────────────────
  const selectTab = (name: RegExp | string) =>
    fireEvent.click(screen.getByRole('tab', { name }));

  // Opens the Advanced disclosure in the currently-rendered pane.
  const openAdvanced = () =>
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));

  it('renders correctly with initial settings', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    expect(screen.getByLabelText(/Save to subfolder \(in Downloads\):/)).toHaveValue('downloads');
    expect(screen.getByLabelText(/File name prefix:/)).toHaveValue('image_');
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onSettingsChange with updated settings when save is clicked', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    fireEvent.change(screen.getByLabelText(/Save to subfolder \(in Downloads\):/), { target: { value: 'new_path' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      downloadPath: 'new_path',
    }));
  });

  it('toggles switch settings correctly', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    selectTab(/Display/i);
    const toggle = screen.getByRole('switch', { name: /show image count/i });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      showImageCount: false,
    }));
  });

  it('toggles exclude emoji', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={initialSettings}
      />
    );
    selectTab(/Media/i);
    fireEvent.click(screen.getByRole('switch', { name: /exclude emoji/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      excludeEmoji: true,
    }));
  });

  it('saves number fields as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    selectTab(/Media/i);
    fireEvent.change(screen.getByLabelText('Minimum image size (px):'), { target: { value: '128' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ minimumImageSize: 128 }));
  });

  it('saves the thumbnail and preview sizes as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    selectTab(/Display/i);
    openAdvanced(); // reveals previewSize
    fireEvent.change(screen.getByLabelText('Thumbnail size (px):'), { target: { value: '96' } });
    fireEvent.change(screen.getByLabelText('Preview size (px):'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailSize: 96, previewSize: 500 }),
    );
  });

  it('reveals the corner selector only after enabling the bubble', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    selectTab(/Display/i);
    expect(screen.queryByLabelText('Bubble corner:')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    const corner = screen.getByLabelText('Bubble corner:');
    fireEvent.change(corner, { target: { value: 'top-left' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bubbleEnabled: true,
        bubblePosition: expect.objectContaining({ corner: 'top-left' }),
      }),
    );
  });

  it('saves the chosen panel placement', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    selectTab(/Display/i);
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    fireEvent.change(screen.getByLabelText('Panel position:'), { target: { value: 'center' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ bubblePanelPlacement: 'center' }),
    );
  });

  it('saves the bubble width and height as numbers', () => {
    render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />
    );
    selectTab(/Display/i);
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    openAdvanced();
    fireEvent.change(screen.getByLabelText('Bubble width:'), { target: { value: '520' } });
    fireEvent.change(screen.getByLabelText('Bubble height:'), { target: { value: '600' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ bubbleWidth: 520, bubbleHeight: 600 }),
    );
  });

  it('saves the save-as toggle', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.click(screen.getByRole('switch', { name: /ask where to save/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ saveAs: true }));
  });

  it('saves the chosen naming mode', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ namingMode: 'original' }));
  });

  it('toggles resolveOriginals', async () => {
    const onSettingsChange = vi.fn();
    render(<Settings settings={{ ...DEFAULT_SETTINGS }} onClose={() => {}} onSettingsChange={onSettingsChange} />);
    selectTab(/Media/i);
    await userEvent.click(screen.getByRole('switch', { name: /resolve exact originals/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ resolveOriginals: true }));
  });

  it('previews the Downloads subfolder path', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={{ ...initialSettings, downloadPath: 'Pics/Cats' }} />);
    expect(screen.getByText('Downloads/Pics/Cats/image.jpg')).toBeInTheDocument();
  });

  it('hides the file name prefix field in Original naming mode', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    expect(screen.getByLabelText(/File name prefix:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(screen.queryByLabelText(/File name prefix:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prefixed' }));
    expect(screen.getByLabelText(/File name prefix:/)).toBeInTheDocument();
  });

  it('disables Save until something changes', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Save to subfolder \(in Downloads\):/), { target: { value: 'x' } });
    expect(save).toBeEnabled();
  });

  it('closes on the Escape key', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('applies the change AND closes the sheet on Save', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.change(screen.getByLabelText(/Save to subfolder \(in Downloads\):/), { target: { value: 'shots' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ downloadPath: 'shots' }));
    // handleSave persists via the parent, then dismisses the sheet.
    expect(mockOnClose).toHaveBeenCalled();
  });

  // NOTE on clampOnBlur (Settings.tsx): two of its branches are unreachable
  // from the rendered component and cannot be covered without changing src —
  //  • the `max = Number.POSITIVE_INFINITY` default: every call site
  //    passes an explicit max, so the default is never taken.
  //  • the `Number.isFinite(n) ? … : min` false arm: every clamped field
  //    is <input type="number">, which jsdom (and the browser) sanitises a
  //    non-numeric value to '' → Number('') === 0 (finite), so `n` is never NaN.
  // The clamp tests below cover the finite arm at every bound (min/max/empty).
  it('clamps an out-of-range number field to its max on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    const thumb = screen.getByLabelText('Thumbnail size (px):');
    fireEvent.change(thumb, { target: { value: '9999' } });
    fireEvent.blur(thumb);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ thumbnailSize: 240 }));
  });

  it('clamps the minimum image size to its cap on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    const min = screen.getByLabelText('Minimum image size (px):');
    fireEvent.change(min, { target: { value: '999999' } });
    fireEvent.blur(min);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ minimumImageSize: 10000 }));
  });

  it('exposes the sheet as a labelled modal dialog', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true');
  });

  // ── Remaining toggles ──────────────────────────────────────────────────────
  it('saves the exclude-base64-images toggle', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    fireEvent.click(screen.getByRole('switch', { name: /exclude base64 images/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ excludeBase64Images: true }));
  });

  it('saves the capture-HLS-streams toggle', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    fireEvent.click(screen.getByRole('switch', { name: /capture video streams/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ captureHlsStreams: true }));
  });

  it('saves the deep-scan click-load-more toggle', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    openAdvanced();
    fireEvent.click(screen.getByRole('switch', { name: /click .*load more.* buttons/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ deepScanClickLoadMore: true }));
  });

  // ── Dropdowns ──────────────────────────────────────────────────────────────
  it('saves the chosen image-conversion format', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.change(screen.getByLabelText('Convert images on download to:'), { target: { value: 'jpeg' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ convertImagesTo: 'jpeg' }));
  });

  it('saves the PNG image-conversion format', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.change(screen.getByLabelText('Convert images on download to:'), { target: { value: 'png' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ convertImagesTo: 'png' }));
  });

  it('saves the chosen bubble corner from every option', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    fireEvent.change(screen.getByLabelText('Bubble corner:'), { target: { value: 'top-right' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ bubblePosition: expect.objectContaining({ corner: 'top-right', x: 20, y: 20 }) }),
    );
  });

  it('saves a corner-anchored panel placement', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    fireEvent.change(screen.getByLabelText('Panel position:'), { target: { value: 'top-left' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ bubblePanelPlacement: 'top-left' }));
  });

  // ── Number fields ──────────────────────────────────────────────────────────
  it('saves the popup width and height as numbers', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    openAdvanced();
    fireEvent.change(screen.getByLabelText('Popup width:'), { target: { value: '520' } });
    fireEvent.change(screen.getByLabelText('Popup height:'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ popupWidth: 520, popupHeight: 500 }));
  });

  it('saves the deep-scan limits as numbers', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    openAdvanced();
    fireEvent.change(screen.getByLabelText('Max items:'), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText('Max time (seconds):'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Max scroll steps:'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ deepScanMaxItems: 2500, deepScanMaxSeconds: 60, deepScanMaxScrolls: 80 }),
    );
  });

  it('clamps a number field up to its minimum on blur (below-range)', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    openAdvanced();
    const width = screen.getByLabelText('Popup width:');
    fireEvent.change(width, { target: { value: '10' } });
    fireEvent.blur(width);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ popupWidth: 320 }));
  });

  it('clamps the deep-scan max-items below its floor on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    openAdvanced();
    const items = screen.getByLabelText('Max items:');
    fireEvent.change(items, { target: { value: '5' } });
    fireEvent.blur(items);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ deepScanMaxItems: 50 }));
  });

  it('clamps the deep-scan max-seconds above its ceiling on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    openAdvanced();
    const secs = screen.getByLabelText('Max time (seconds):');
    fireEvent.change(secs, { target: { value: '9999' } });
    fireEvent.blur(secs);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ deepScanMaxSeconds: 120 }));
  });

  it('clamps the deep-scan max-scrolls below its floor on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Media/i);
    openAdvanced();
    const scrolls = screen.getByLabelText('Max scroll steps:');
    fireEvent.change(scrolls, { target: { value: '1' } });
    fireEvent.blur(scrolls);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ deepScanMaxScrolls: 5 }));
  });

  it('clamps the bubble width above its ceiling on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    fireEvent.click(screen.getByRole('switch', { name: /show floating bubble/i }));
    openAdvanced();
    const w = screen.getByLabelText('Bubble width:');
    fireEvent.change(w, { target: { value: '99999' } });
    fireEvent.blur(w);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ bubbleWidth: 3840 }));
  });

  // ── Folder-path preview ────────────────────────────────────────────────────
  it('expands template tokens in the folder preview', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={{ ...initialSettings, downloadPath: 'Media/{domain}' }}
      />,
    );
    expect(screen.getByText('Downloads/Media/example.com/image.jpg')).toBeInTheDocument();
  });

  it('falls back to the plain Downloads path when the template is empty', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={{ ...initialSettings, downloadPath: '' }}
      />,
    );
    expect(screen.getByText('Downloads/image.jpg')).toBeInTheDocument();
  });

  // ── notifyOnComplete permission flow ───────────────────────────────────────
  it('turns notifications off without asking for permission', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={{ ...initialSettings, notifyOnComplete: true }}
      />,
    );
    // notifyOnComplete: true is non-default, so Downloads' Advanced section is
    // already auto-expanded on render — no openAdvanced() needed (and calling it
    // here would toggle it closed instead of open).
    fireEvent.click(screen.getByRole('switch', { name: /notify when downloads finish/i }));
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ notifyOnComplete: false }));
  });

  it('keeps notifications on when the permission is granted', () => {
    (chrome.permissions.request as Mock).mockImplementation(
      (_perms: chrome.permissions.Permissions, cb: (granted: boolean) => void) => cb(true),
    );
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    openAdvanced();
    const toggle = screen.getByRole('switch', { name: /notify when downloads finish/i });
    fireEvent.click(toggle);
    expect(chrome.permissions.request).toHaveBeenCalledWith(
      { permissions: ['notifications'] },
      expect.any(Function),
    );
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ notifyOnComplete: true }));
  });

  it('persists notify ON immediately, without waiting for Save (survives the prompt closing the popup)', () => {
    (chrome.permissions.request as Mock).mockImplementation(
      (_perms: chrome.permissions.Permissions, cb: (granted: boolean) => void) => cb(true),
    );
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    openAdvanced();
    fireEvent.click(screen.getByRole('switch', { name: /notify when downloads finish/i }));
    // The setting is written straight away via SET_SETTINGS — the user never has
    // to reach Save, which the permission prompt can make unreachable by closing
    // the popup. (Without this, enabling notifications silently never persisted.)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_SETTINGS', patch: expect.objectContaining({ notifyOnComplete: true }) }),
    );
  });

  it('persists the revert immediately when the permission is denied', () => {
    (chrome.permissions.request as Mock).mockImplementation(
      (_perms: chrome.permissions.Permissions, cb: (granted: boolean) => void) => cb(false),
    );
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    openAdvanced();
    fireEvent.click(screen.getByRole('switch', { name: /notify when downloads finish/i }));
    const calls = (chrome.runtime.sendMessage as Mock).mock.calls.map((c) => c[0]);
    // Optimistically persisted ON, then rolled back to OFF once denied.
    expect(calls).toContainEqual(expect.objectContaining({ type: 'SET_SETTINGS', patch: expect.objectContaining({ notifyOnComplete: true }) }));
    expect(calls).toContainEqual(expect.objectContaining({ type: 'SET_SETTINGS', patch: expect.objectContaining({ notifyOnComplete: false }) }));
  });

  it('reverts notifications off when the permission is denied', () => {
    (chrome.permissions.request as Mock).mockImplementation(
      (_perms: chrome.permissions.Permissions, cb: (granted: boolean) => void) => cb(false),
    );
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    openAdvanced();
    const toggle = screen.getByRole('switch', { name: /notify when downloads finish/i });
    fireEvent.click(toggle);
    expect(chrome.permissions.request).toHaveBeenCalledWith(
      { permissions: ['notifications'] },
      expect.any(Function),
    );
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Nothing changed, so Save stays disabled and no settings are persisted.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(mockOnSettingsChange).not.toHaveBeenCalled();
  });

  // ── Backup export / import ─────────────────────────────────────────────────
  it('exports a backup as a downloadable JSON file', async () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Data/i);
    fireEvent.click(screen.getByRole('button', { name: /export backup/i }));

    expect(await screen.findByText('Backup exported.')).toBeInTheDocument();
    const download = (chrome.runtime.sendMessage as Mock).mock.calls
      .map((c) => c[0])
      .find((m) => m && m.type === 'DOWNLOAD_TEXT');
    expect(download).toBeTruthy();
    expect(download.filename).toMatch(/^media-bulk-downloads-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(download.mime).toBe('application/json');
    const payload = JSON.parse(download.text);
    expect(payload).toMatchObject({
      app: 'media-bulk-downloads',
      version: 1,
      settings: expect.objectContaining({ downloadPath: 'downloads' }),
    });
    expect(typeof payload.exportedAt).toBe('string');
  });

  it('imports a valid backup: applies settings and restores data', async () => {
    const backup = {
      app: 'media-bulk-downloads',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      settings: { ...initialSettings, downloadPath: 'imported/path', minimumImageSize: 200 },
      favourites: [{ src: 'https://example.com/a.jpg', time: 1 }],
      history: [{ src: 'https://example.com/b.jpg', time: 2 }],
      excluded: [{ kind: 'host', value: 'ads.example.com', time: 3 }],
    };
    const { container } = render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />,
    );
    selectTab(/Data/i);
    // Cover the Import-backup button's click handler (opens the hidden picker).
    fireEvent.click(screen.getByRole('button', { name: /import backup/i }));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await userEvent.upload(input, file);

    expect(
      await screen.findByText('Imported settings, 1 favourites, 1 history entries, and 1 blocked sources.'),
    ).toBeInTheDocument();
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ downloadPath: 'imported/path', minimumImageSize: 200 }),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RESTORE_DATA',
        favourites: [{ src: 'https://example.com/a.jpg', time: 1 }],
        history: [{ src: 'https://example.com/b.jpg', time: 2 }],
        excluded: [{ kind: 'host', value: 'ads.example.com', time: 3 }],
      }),
    );
  });

  it('ignores an import with no file selected', () => {
    const { container } = render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />,
    );
    selectTab(/Data/i);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    // A change event with the input's default (empty) FileList — handleImportBackup
    // should bail out early without a note or any side effects.
    fireEvent.change(input);
    expect(screen.queryByText(/backup/i, { selector: 'p[aria-live]' })).not.toBeInTheDocument();
    expect(mockOnSettingsChange).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('resets a cleared number field to its minimum on blur', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    selectTab(/Display/i);
    openAdvanced();
    const height = screen.getByLabelText('Popup height:');
    // Clearing a number input yields an empty value (Number('') === 0), which
    // clampOnBlur lifts back up to the field's minimum.
    fireEvent.change(height, { target: { value: '' } });
    fireEvent.blur(height);
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ popupHeight: 400 }));
  });

  it('rejects an invalid backup file with an error note', async () => {
    const { container } = render(
      <Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />,
    );
    selectTab(/Data/i);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    // A .json file (so it clears the input's accept filter) whose contents are
    // not a valid Media Bulk Downloads backup — here, not even valid JSON.
    const file = new File(['this is not a backup'], 'notes.json', { type: 'application/json' });
    await userEvent.upload(input, file);

    expect(
      await screen.findByText('That file is not a valid Media Bulk Downloads backup.'),
    ).toBeInTheDocument();
    expect(mockOnSettingsChange).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  // ── Tabbed sheet behavior ────────────────────────────────────────────────
  it('keeps edits from multiple tabs and saves them together', () => {
    render(<Settings onClose={mockOnClose} onSettingsChange={mockOnSettingsChange} settings={initialSettings} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Ask where to save each file' })); // Downloads
    fireEvent.click(screen.getByRole('tab', { name: /Media/i }));
    fireEvent.click(screen.getByRole('switch', { name: 'Exclude emoji' }));               // Media
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ saveAs: true, excludeEmoji: true }),
    );
  });

  it('opens a pane Advanced section when one of its fields is non-default', () => {
    render(
      <Settings
        onClose={mockOnClose}
        onSettingsChange={mockOnSettingsChange}
        settings={{ ...initialSettings, downloadConcurrency: 8 }}
      />,
    );
    // Downloads Advanced auto-opened → the field is visible without clicking Advanced.
    expect(screen.getByLabelText('Simultaneous downloads:')).toBeInTheDocument();
  });
});
