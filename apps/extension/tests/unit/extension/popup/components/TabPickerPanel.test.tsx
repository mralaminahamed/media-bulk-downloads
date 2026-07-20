import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TabPickerPanel from '@/extension/popup/components/panels/TabPickerPanel';
import type { OpenTabInfo } from '@/extension/shared/active-tab/collect-open-tabs';

const TABS: OpenTabInfo[] = [
  { id: 1, title: 'Alpha', url: 'https://a.com/x' },
  { id: 2, title: 'Beta', url: 'https://b.com/y' },
  { id: 3, title: 'Gamma', url: 'https://c.com/z' },
];

const loadTabs = (list: OpenTabInfo[] = TABS) => () => Promise.resolve(list);

describe('TabPickerPanel', () => {
  it('lists the eligible tabs', async () => {
    render(<TabPickerPanel onClose={() => {}} onConfirm={() => {}} loadTabs={loadTabs()} />);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('c.com')).toBeInTheDocument();
  });

  it('confirms with the ticked tab ids', async () => {
    const onConfirm = vi.fn();
    render(<TabPickerPanel onClose={() => {}} onConfirm={onConfirm} loadTabs={loadTabs()} />);
    await screen.findByText('Alpha');

    const confirm = screen.getByRole('button', { name: /Select tabs to scan/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Scan tab: Alpha'));
    fireEvent.click(screen.getByLabelText('Scan tab: Gamma'));

    const scan = screen.getByRole('button', { name: /Scan selected \(2\)/i });
    fireEvent.click(scan);
    expect(onConfirm).toHaveBeenCalledWith([1, 3]);
  });

  it('preselects initialSelected and drops ids no longer open', async () => {
    const onConfirm = vi.fn();
    render(<TabPickerPanel onClose={() => {}} onConfirm={onConfirm} initialSelected={[2, 9]} loadTabs={loadTabs()} />);
    await screen.findByText('Beta');

    const scan = await screen.findByRole('button', { name: /Scan selected \(1\)/i });
    fireEvent.click(scan);
    expect(onConfirm).toHaveBeenCalledWith([2]);
  });

  it('select-all then clear toggles every tab', async () => {
    const onConfirm = vi.fn();
    render(<TabPickerPanel onClose={() => {}} onConfirm={onConfirm} loadTabs={loadTabs()} />);
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: /Scan selected \(3\)/i }));
    expect(onConfirm).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('shows an empty state when no tabs are scannable', async () => {
    render(<TabPickerPanel onClose={() => {}} onConfirm={() => {}} loadTabs={loadTabs([])} />);
    expect(await screen.findByText(/No scannable tabs/i)).toBeInTheDocument();
  });
});
