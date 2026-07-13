import {
  ArrowPathIcon, CheckCircleIcon, XCircleIcon, ClockIcon, XMarkIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import type { QueueItem, QueueStatus } from '@mbd/storage/download-queue';
import { formatFileSize } from './ImageList';

export interface QueueRowProps {
  item: QueueItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRetryReferer: (id: string) => void;
  onOpen: (id: string) => void;
}

const STATUS: Record<QueueStatus, { Icon: typeof ArrowPathIcon; cls: string; label: string }> = {
  active: { Icon: ArrowPathIcon, cls: 'mbd:text-(--ink-2) mbd:animate-[spin_0.9s_linear_infinite]', label: 'Downloading' },
  done: { Icon: CheckCircleIcon, cls: 'mbd:text-(--brand-ink)', label: 'Done' },
  failed: { Icon: XCircleIcon, cls: 'mbd:text-(--danger)', label: 'Failed' },
  queued: { Icon: ClockIcon, cls: 'mbd:text-(--ink-3)', label: 'Queued' },
};

const iconBtn = 'mbd:grid mbd:h-5 mbd:w-5 mbd:shrink-0 mbd:place-items-center mbd:rounded mbd:text-(--ink-3) mbd:hover:text-(--ink) mbd:hover:bg-(--panel-2)';

export function QueueRow({ item, onCancel, onRetry, onRetryReferer, onOpen }: QueueRowProps) {
  const { Icon, cls, label } = STATUS[item.status];
  const pct =
    item.status === 'active' && item.totalBytes && item.totalBytes > 0
      ? Math.min(100, Math.round(((item.bytesReceived ?? 0) / item.totalBytes) * 100))
      : null;

  return (
    <li className={`download-queue__item is-${item.status} mbd:flex mbd:items-center mbd:gap-2 mbd:text-[11px]`}>
      <span role="img" aria-label={label} className="mbd:inline-grid mbd:shrink-0 mbd:place-items-center">
        <Icon className={`mbd:h-3.5 mbd:w-3.5 ${cls}`} aria-hidden="true" />
      </span>
      <span className="mbd:min-w-0 mbd:flex-1 mbd:truncate mbd:text-(--ink)" title={item.filename}>{item.filename}</span>

      {item.status === 'active' && (
        <span className="mbd:flex mbd:shrink-0 mbd:items-center mbd:gap-1.5">
          <span className="mbd:block mbd:h-1 mbd:w-14 mbd:overflow-hidden mbd:rounded-full mbd:bg-(--panel-2)">
            <span className="mbd:block mbd:h-full mbd:rounded-full mbd:bg-(--brand-ink) mbd:transition-[width] mbd:duration-300" style={{ width: `${pct ?? 0}%` }} />
          </span>
          {pct != null && <span className="num mbd:w-8 mbd:text-right mbd:text-(--ink-2)">{pct}%</span>}
          {item.totalBytes != null && (
            <span className="num mbd:text-(--ink-3)">{formatFileSize(item.bytesReceived ?? 0)}/{formatFileSize(item.totalBytes)}</span>
          )}
        </span>
      )}

      {item.status === 'failed' && item.error && <span className="mbd:shrink-0 mbd:truncate mbd:text-(--ink-3)" title={item.error}>{item.error}</span>}

      {item.status === 'done' && (
        <button type="button" aria-label="Open file" title="Open file" onClick={() => onOpen(item.id)} className={iconBtn}>
          <ArrowTopRightOnSquareIcon className="mbd:h-3.5 mbd:w-3.5" />
        </button>
      )}
      {item.status === 'failed' && (item.hotlink ? (
        <button type="button" onClick={() => onRetryReferer(item.id)} className="mbd:shrink-0 mbd:text-(--ink-3) mbd:hover:text-(--ink)"
          title="Retry sending this page as the Referer (asks for permission the first time)">Retry w/ referer</button>
      ) : (
        <button type="button" aria-label="Retry" title="Retry" onClick={() => onRetry(item.id)} className={iconBtn}>
          <ArrowPathIcon className="mbd:h-3.5 mbd:w-3.5" />
        </button>
      ))}
      {(item.status === 'queued' || item.status === 'active') && (
        <button type="button" aria-label="Cancel" title="Cancel" onClick={() => onCancel(item.id)} className={iconBtn}>
          <XMarkIcon className="mbd:h-3.5 mbd:w-3.5" />
        </button>
      )}
    </li>
  );
}
