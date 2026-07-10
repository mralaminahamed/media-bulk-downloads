import { useEffect, useState } from 'react';
import { loadQueue, QUEUE_KEY, type QueueState } from '@/extension/shared/storage/download-queue';
import { sendRuntimeMessage } from '../utils';
import { QueueRow } from './QueueRow';

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
  const finished = items.filter((i) => i.status === 'done' || i.status === 'failed').length;

  // Overall bar: bytes-weighted across items whose size is known, else done/total.
  const sized = items.filter((i) => i.totalBytes && i.totalBytes > 0);
  const overallPct = sized.length
    ? Math.round((sized.reduce((a, i) => a + Math.min(i.bytesReceived ?? 0, i.totalBytes as number), 0) /
        sized.reduce((a, i) => a + (i.totalBytes as number), 0)) * 100)
    : Math.round((done / items.length) * 100);

  // Requesting an optional permission must happen in a user gesture — do it here
  // on the click, then message the background to retry with the Referer rewrite.
  const retryWithReferer = async (id: string) => {
    const granted = await chrome.permissions.request({ permissions: ['declarativeNetRequestWithHostAccess'] });
    if (granted) sendRuntimeMessage({ type: 'QUEUE_RETRY', id, referer: true });
  };
  const btn = 'rounded px-1.5 py-0.5 text-(--ink-2) hover:text-(--ink) hover:bg-(--panel-2)';

  return (
    <section className="download-queue border-t hairline bg-(--panel) px-4 py-2.5" aria-label="Download queue">
      <header className="mb-1.5 flex items-center gap-2 text-[11px] text-(--ink-2)">
        <div role="status" aria-live="polite" className="flex items-center gap-2">
          <strong className="num text-(--ink)">{done} / {items.length}</strong>
          {failed > 0 && <span className="text-(--danger)">{failed} failed</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={btn}
            onClick={() => sendRuntimeMessage({ type: paused ? 'QUEUE_RESUME' : 'QUEUE_PAUSE' })}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          {failed > 0 && (
            <button type="button" className={btn} onClick={() => sendRuntimeMessage({ type: 'QUEUE_RETRY', id: 'all-failed' })}>
              Retry failed
            </button>
          )}
          {finished > 0 && (
            <button type="button" className={btn} onClick={() => sendRuntimeMessage({ type: 'QUEUE_CLEAR' })}>
              Clear done
            </button>
          )}
          <button type="button" className={btn} onClick={() => sendRuntimeMessage({ type: 'QUEUE_CANCEL' })}>
            Cancel all
          </button>
        </div>
      </header>

      <div className="mb-2 h-1 overflow-hidden rounded-full bg-(--panel-2)" aria-hidden="true">
        <span className="block h-full rounded-full bg-(--brand-ink) transition-[width] duration-300" style={{ width: `${overallPct}%` }} />
      </div>

      <ul className="max-h-40 space-y-0.5 overflow-y-auto">
        {items.map((i) => (
          <QueueRow
            key={i.id}
            item={i}
            onCancel={(id) => sendRuntimeMessage({ type: 'QUEUE_CANCEL', id })}
            onRetry={(id) => sendRuntimeMessage({ type: 'QUEUE_RETRY', id })}
            onRetryReferer={(id) => void retryWithReferer(id)}
            onOpen={(id) => sendRuntimeMessage({ type: 'QUEUE_OPEN', id })}
          />
        ))}
      </ul>
    </section>
  );
}
