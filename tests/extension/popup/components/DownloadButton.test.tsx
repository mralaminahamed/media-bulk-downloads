import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DownloadButton } from '@/extension/popup/components/DownloadButton';

const handlers = () => ({
  onDownload: jest.fn(),
  onZip: jest.fn(),
  onCopyLinks: jest.fn(),
  onExportLinks: jest.fn(),
  onExclude: jest.fn(),
});

describe('DownloadButton', () => {
  it('renders the label, a count pill, and a spelled-out accessible name', () => {
    const h = handlers();
    render(<DownloadButton label="Download selected" count={5} {...h} />);
    const primary = screen.getByRole('button', { name: 'Download selected 5' });
    expect(primary).toBeInTheDocument();
    expect(screen.getByText('5')).toHaveClass('countpill');
  });

  it('omits the count pill when count is undefined', () => {
    const h = handlers();
    render(<DownloadButton label="Download" {...h} />);
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(document.querySelector('.countpill')).not.toBeInTheDocument();
  });

  it('calls onDownload when the primary area is clicked', () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={3} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download 3' }));
    expect(h.onDownload).toHaveBeenCalledTimes(1);
  });

  it('disables both the primary and the caret button when disabled', () => {
    const h = handlers();
    render(<DownloadButton label="Download" disabled count={0} {...h} />);
    expect(screen.getByRole('button', { name: 'Download 0' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'More download options' })).toBeDisabled();
  });

  it('opens the menu from the caret and closes it after choosing an action', async () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={2} {...h} />);
    const caret = screen.getByRole('button', { name: 'More download options' });
    expect(caret).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(caret);
    expect(caret).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitem', { name: 'As ZIP archive' }));
    expect(h.onZip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('wires every menu action to its handler', async () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={2} {...h} />);

    const open = async (): Promise<void> => {
      await userEvent.click(screen.getByRole('button', { name: 'More download options' }));
    };

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'As separate files' }));
    expect(h.onDownload).toHaveBeenCalledTimes(1);

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy links' }));
    expect(h.onCopyLinks).toHaveBeenCalledTimes(1);

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export links (.txt)' }));
    expect(h.onExportLinks).toHaveBeenCalledTimes(1);

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Exclude' }));
    expect(h.onExclude).toHaveBeenCalledTimes(1);
  });

  it('offers the Exclude action only when onExclude is provided', async () => {
    // No onExclude → the split-menu variant without the Exclude item.
    render(
      <DownloadButton
        label="Download"
        count={2}
        onDownload={jest.fn()}
        onZip={jest.fn()}
        onCopyLinks={jest.fn()}
        onExportLinks={jest.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More download options' }));
    expect(screen.queryByRole('menuitem', { name: 'Exclude' })).not.toBeInTheDocument();
  });

  it('closes the menu on an outside click', async () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={2} {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'More download options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', async () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={2} {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'More download options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves the menu open on a non-Escape key', async () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={2} {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'More download options' }));
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('toggles the menu closed on a second caret click', async () => {
    const h = handlers();
    render(<DownloadButton label="Download" count={2} {...h} />);
    const caret = screen.getByRole('button', { name: 'More download options' });
    await userEvent.click(caret);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(caret);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
