import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveAsPromptHint } from '@/extension/popup/components/SaveAsPromptHint';
import * as store from '@mbd/storage/save-as-hint';

it('renders nothing until seen', async () => {
  vi.spyOn(store, 'loadSaveAsHintState').mockResolvedValue({ seen: false, dismissed: false });
  const { container } = render(<SaveAsPromptHint />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('renders nothing when dismissed', async () => {
  vi.spyOn(store, 'loadSaveAsHintState').mockResolvedValue({ seen: true, dismissed: true });
  const { container } = render(<SaveAsPromptHint />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('shows the hint when seen and not dismissed; on Chromium, Open opens the download settings', async () => {
  const ua = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 Chrome/120.0 Safari/537.36', configurable: true });
  try {
    vi.spyOn(store, 'loadSaveAsHintState').mockResolvedValue({ seen: true, dismissed: false });
    const create = vi.spyOn(chrome.tabs, 'create').mockImplementation((() => {}) as never);
    render(<SaveAsPromptHint />);
    expect(await screen.findByText(/ask where to save each file/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open download settings/i }));
    expect(create).toHaveBeenCalledWith({ url: 'chrome://settings/downloads' });
  } finally {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  }
});

it('hides the Open-settings deep link on non-Chromium browsers (Firefox)', async () => {
  const ua = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 Firefox/121.0', configurable: true });
  try {
    vi.spyOn(store, 'loadSaveAsHintState').mockResolvedValue({ seen: true, dismissed: false });
    render(<SaveAsPromptHint />);
    expect(await screen.findByText(/ask where to save each file/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open download settings/i })).not.toBeInTheDocument();
  } finally {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  }
});

it('hides the Open-settings button in the bubble surface (chrome.tabs is undefined there)', async () => {
  vi.spyOn(store, 'loadSaveAsHintState').mockResolvedValue({ seen: true, dismissed: false });
  render(<SaveAsPromptHint surface="bubble" />);
  expect(await screen.findByText(/ask where to save each file/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /open download settings/i })).not.toBeInTheDocument();
});

it('Dismiss persists the dismissed flag', async () => {
  vi.spyOn(store, 'loadSaveAsHintState').mockResolvedValue({ seen: true, dismissed: false });
  const dismiss = vi.spyOn(store, 'dismissSaveAsHint').mockResolvedValue();
  render(<SaveAsPromptHint />);
  await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
  expect(dismiss).toHaveBeenCalled();
});
