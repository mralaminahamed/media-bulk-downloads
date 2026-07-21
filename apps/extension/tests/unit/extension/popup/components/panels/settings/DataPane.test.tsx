import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataPane from '@/extension/popup/components/panels/settings/DataPane';

const baseProps = () => ({
  onExport: vi.fn(),
  onImportFile: vi.fn(),
  fileInputRef: React.createRef<HTMLInputElement>(),
  backupNote: '',
  onResetSettings: vi.fn(),
  onClearData: vi.fn(),
});

describe('DataPane — reset settings / clear all data', () => {
  it('resets settings only on the confirming (second) click', async () => {
    const props = baseProps();
    const user = userEvent.setup();
    render(<DataPane {...props} />);
    const btn = screen.getByRole('button', { name: 'Reset settings' });

    await user.click(btn);
    expect(props.onResetSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm reset settings' }));
    expect(props.onResetSettings).toHaveBeenCalledTimes(1);
    expect(props.onClearData).not.toHaveBeenCalled();
  });

  it('clears all data only on the confirming (second) click', async () => {
    const props = baseProps();
    const user = userEvent.setup();
    render(<DataPane {...props} />);
    const btn = screen.getByRole('button', { name: 'Clear all data' });

    await user.click(btn);
    expect(props.onClearData).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm clear all data' }));
    expect(props.onClearData).toHaveBeenCalledTimes(1);
    expect(props.onResetSettings).not.toHaveBeenCalled();
  });

  it('still renders the export/import controls', () => {
    render(<DataPane {...baseProps()} />);
    expect(screen.getByRole('button', { name: /export backup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import backup/i })).toBeInTheDocument();
  });
});
