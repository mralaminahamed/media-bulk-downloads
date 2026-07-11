import { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { loadQueue, QUEUE_KEY, type QueueState } from '@/extension/shared/storage/download-queue';
import { sendRuntimeMessage } from '../utils';
import { QueueRow } from './QueueRow';

// Persisted in chrome.storage.local so the collapsed choice survives the popup
// remounting on every reopen (a long queue would otherwise re-expand each time).
const COLLAPSE_KEY = 'downloadQueueCollapsed';

/**
 * Live view of the persistent download queue (#196). Reads state reactively from
 * chrome.storage.local (the background dispatcher's source of truth) so it stays
 * accurate across popup reopens and service-worker restarts, and drives the
 * pause/resume/cancel/retry controls by messaging the background.
 */
export function DownloadQueue() {
  const [state, setState] = useState<QueueState>({ items: [], paused: false });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadQueue().then((s) => {
      if (alive) setState(s);
    });
    void chrome.storage.local.get(COLLAPSE_KEY).then((r) => {
      if (alive) setCollapsed(Boolean(r[COLLAPSE_KEY]));
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
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      void chrome.storage.local.set({ [COLLAPSE_KEY]: next });
      return next;
    });
  };
  const btn = 'mbd:rounded mbd:px-1.5 mbd:py-0.5 mbd:text-(--ink-2) mbd:hover:text-(--ink) mbd:hover:bg-(--panel-2)';
  const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;

  return (
    <section className="download-queue mbd:border-t hairline mbd:bg-(--panel) mbd:px-4 mbd:py-2.5" aria-label="Download queue">
      <header className="mbd:mb-1.5 mbd:flex mbd:items-center mbd:gap-2 mbd:text-[11px] mbd:text-(--ink-2)">
        <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand download list' : 'Collapse download list'}
          className="mbd:grid mbd:h-5 mbd:w-5 mbd:shrink-0 mbd:place-items-center mbd:rounded mbd:text-(--ink-3) mbd:hover:text-(--ink) mbd:hover:bg-(--panel-2)">
          <Chevron className="mbd:h-3.5 mbd:w-3.5" aria-hidden="true" />
        </button>
        <div role="status" aria-live="polite" className="mbd:flex mbd:items-center mbd:gap-2">
          <strong className="num mbd:text-(--ink)">{done} / {items.length}</strong>
          {failed > 0 && <span className="mbd:text-(--danger)">{failed} failed</span>}
        </div>
        <div className="mbd:ml-auto mbd:flex mbd:items-center mbd:gap-1">
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

      <div className="mbd:mb-2 mbd:h-1 mbd:overflow-hidden mbd:rounded-full mbd:bg-(--panel-2)" aria-hidden="true">
        <span className="mbd:block mbd:h-full mbd:rounded-full mbd:bg-(--brand-ink) mbd:transition-[width] mbd:duration-300" style={{ width: `${overallPct}%` }} />
      </div>

      {!collapsed && (
        <ul className="scroll-thin mbd:max-h-40 mbd:space-y-0.5 mbd:overflow-y-auto">
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
      )}
    </section>
  );
}
