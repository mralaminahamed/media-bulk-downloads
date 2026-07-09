import { useEffect, useState } from 'react';
import { loadQueue, QUEUE_KEY, type QueueState } from '@/extension/shared/storage/download-queue';
import { sendRuntimeMessage } from '../utils';

/**
 * Live view of the persistent download queue (#196). Reads state reactively from
 * chrome.storage.local (the background dispatcher's source of truth) so it stays
 * accurate across popup reopens and service-worker restarts, and drives the
 * pause/resume/cancel/retry controls by messaging the background.
 */
export function DownloadQueue() {
  const [state, setState] = useState<QueueState>({ items: [], paused: false });

  useEffect(() => {
    let alive = true;
    void loadQueue().then((s) => {
      if (alive) setState(s);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[QUEUE_KEY]) {
        const next = changes[QUEUE_KEY].newValue as QueueState | undefined;
        setState(next ? { items: next.items ?? [], paused: Boolean(next.paused) } : { items: [], paused: false });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const { items, paused } = state;
  if (items.length === 0) return null;

  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;

  // Requesting an optional permission must happen in a user gesture — do it here
  // on the click, then message the background to retry with the Referer rewrite.
  const retryWithReferer = async (id: string) => {
    const granted = await chrome.permissions.request({ permissions: ['declarativeNetRequest'] });
    if (granted) sendRuntimeMessage({ type: 'QUEUE_RETRY', id, referer: true });
  };

  return (
    <section className="download-queue border-t hairline bg-(--panel) px-4 py-2.5" aria-label="Download queue">
      <header className="mb-1.5 flex items-center gap-2 text-[11px] text-(--ink-2)">
        <strong className="num text-(--ink)">
          {done} / {items.length}
        </strong>
        {failed > 0 && <span className="text-(--danger)">{failed} failed</span>}
        <div className="ml-auto flex items-center gap-2">
          {paused ? (
            <button type="button" onClick={() => sendRuntimeMessage({ type: 'QUEUE_RESUME' })} className="hover:text-(--ink)">
              Resume
            </button>
          ) : (
            <button type="button" onClick={() => sendRuntimeMessage({ type: 'QUEUE_PAUSE' })} className="hover:text-(--ink)">
              Pause
            </button>
          )}
          <button type="button" onClick={() => sendRuntimeMessage({ type: 'QUEUE_CANCEL' })} className="hover:text-(--ink)">
            Cancel all
          </button>
        </div>
      </header>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto">
        {items.map((i) => (
          <li key={i.id} className={`download-queue__item is-${i.status} flex items-center gap-2 text-[11px]`}>
            <span className="min-w-0 flex-1 truncate text-(--ink)" title={i.filename}>
              {i.filename}
            </span>
            {i.status === 'failed' && i.error && <span className="truncate text-(--ink-3)">{i.error}</span>}
            <span className="num shrink-0 text-(--ink-2)">{i.status}</span>
            {i.status === 'failed' && i.hotlink ? (
              // A hotlink 403 won't change on a bare retry — offer the Referer
              // rewrite, which needs the optional declarativeNetRequest permission
              // requested here from the click (a user gesture).
              <button
                type="button"
                onClick={() => void retryWithReferer(i.id)}
                className="shrink-0 text-(--ink-3) hover:text-(--ink)"
                title="Retry sending this page as the Referer (asks for permission the first time)"
              >
                Retry w/ referer
              </button>
            ) : (
              i.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => sendRuntimeMessage({ type: 'QUEUE_RETRY', id: i.id })}
                  className="shrink-0 text-(--ink-3) hover:text-(--ink)"
                >
                  Retry
                </button>
              )
            )}
            {(i.status === 'queued' || i.status === 'active') && (
              <button
                type="button"
                onClick={() => sendRuntimeMessage({ type: 'QUEUE_CANCEL', id: i.id })}
                className="shrink-0 text-(--ink-3) hover:text-(--ink)"
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
