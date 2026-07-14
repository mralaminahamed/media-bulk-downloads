/**
 * The background worker flags `saveAsPromptSeen` (see save-as-hint.ts) the moment
 * a download is interrupted with USER_CANCELED — Chrome's signal that the user
 * dismissed its native Save-As dialog. That listener is registered at module
 * import time, so — mirroring relay-fb.test.ts's capture pattern — the dependency
 * is mocked (a plain vi.spyOn on a statically-imported namespace wouldn't survive
 * vi.resetModules(): the reimported background pulls in a fresh save-as-hint
 * instance distinct from the one spied on before the reset, whereas a vi.mock
 * factory is reused across resets), then modules are reset and the background
 * worker is re-imported so every captured `chrome.downloads.onChanged` handler
 * can be driven directly (the queue dispatcher registers its own listener too;
 * firing both is fine and intentional).
 */
import type { Mock } from 'vitest';

vi.mock('@mbd/storage/save-as-hint', async () => ({
  ...(await vi.importActual<typeof import('@mbd/storage/save-as-hint')>('@mbd/storage/save-as-hint')),
  markSaveAsPromptSeen: vi.fn().mockResolvedValue(undefined),
}));

type Handler = (delta: unknown) => void;

const loadBackground = async (): Promise<{ handlers: Handler[]; mark: Mock }> => {
  vi.resetModules();
  const addSpy = vi.spyOn(chrome.downloads.onChanged, 'addListener');

  await import('@/extension/background');

  const handlers = addSpy.mock.calls.map((c) => c[0]) as Handler[];
  addSpy.mockRestore();

  const hintMod = await import('@mbd/storage/save-as-hint');
  const mark = hintMod.markSaveAsPromptSeen as unknown as Mock;
  // vi.resetModules() reuses the vi.mock factory's fn (unlike jest.resetModules),
  // so its call history persists across loadBackground() calls — clear it per load.
  mark.mockClear();
  return { handlers, mark };
};

describe('background downloads.onChanged — save-as prompt hint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('flags saveAsPromptSeen when a download is USER_CANCELED', async () => {
    const { handlers, mark } = await loadBackground();
    handlers.forEach((h) => h({ id: 1, error: { current: 'USER_CANCELED' } }));
    expect(mark).toHaveBeenCalled();
  });

  it('does not flag on a normal completion', async () => {
    const { handlers, mark } = await loadBackground();
    handlers.forEach((h) => h({ id: 1, state: { current: 'complete' } }));
    expect(mark).not.toHaveBeenCalled();
  });
});
