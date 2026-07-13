import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsTabs } from '@/extension/popup/components/panels/settings/SettingsTabs';

const TABS = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'media', label: 'Media' },
  { id: 'display', label: 'Display' },
  { id: 'data', label: 'Data' },
];

describe('SettingsTabs', () => {
  it('marks the active tab selected and wires aria-controls', () => {
    render(<SettingsTabs tabs={TABS} active="downloads" onSelect={() => {}} />);
    const downloads = screen.getByRole('tab', { name: 'Downloads' });
    expect(downloads).toHaveAttribute('aria-selected', 'true');
    expect(downloads).toHaveAttribute('aria-controls', 'settings-panel-downloads');
    expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect when a tab is clicked', () => {
    const onSelect = vi.fn();
    render(<SettingsTabs tabs={TABS} active="downloads" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    expect(onSelect).toHaveBeenCalledWith('media');
  });

  it('moves selection with ArrowRight (roving), wrapping at the end', () => {
    const onSelect = vi.fn();
    render(<SettingsTabs tabs={TABS} active="data" onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Data' }), { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('downloads');
  });
});
