import {
  ArrowPathIcon, CheckCircleIcon, XCircleIcon, ClockIcon, XMarkIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import type { QueueItem, QueueStatus } from '@/extension/shared/storage/download-queue';
import { formatFileSize } from './ImageList';

export interface QueueRowProps {
  item: QueueItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRetryReferer: (id: string) => void;
  onOpen: (id: string) => void;
}

const STATUS: Record<QueueStatus, { Icon: typeof ArrowPathIcon; cls: string; label: string }> = {
  active: { Icon: ArrowPathIcon, cls: 'text-(--ink-2) animate-[spin_0.9s_linear_infinite]', label: 'Downloading' },
  done: { Icon: CheckCircleIcon, cls: 'text-(--brand-ink)', label: 'Done' },
  failed: { Icon: XCircleIcon, cls: 'text-(--danger)', label: 'Failed' },
  queued: { Icon: ClockIcon, cls: 'text-(--ink-3)', label: 'Queued' },
};

const iconBtn = 'grid h-5 w-5 shrink-0 place-items-center rounded text-(--ink-3) hover:text-(--ink) hover:bg-(--panel-2)';

export function QueueRow({ item, onCancel, onRetry, onRetryReferer, onOpen }: QueueRowProps) {
  const { Icon, cls, label } = STATUS[item.status];
  const pct =
    item.status === 'active' && item.totalBytes && item.totalBytes > 0
      ? Math.min(100, Math.round(((item.bytesReceived ?? 0) / item.totalBytes) * 100))
      : null;

  return (
    <li className={`download-queue__item is-${item.status} flex items-center gap-2 text-[11px]`}>
      <span role="img" aria-label={label} className="inline-grid shrink-0 place-items-center">
        <Icon className={`h-3.5 w-3.5 ${cls}`} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-(--ink)" title={item.filename}>{item.filename}</span>

      {item.status === 'active' && (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="block h-1 w-14 overflow-hidden rounded-full bg-(--panel-2)">
            <span className="block h-full rounded-full bg-(--brand-ink) transition-[width] duration-300" style={{ width: `${pct ?? 0}%` }} />
          </span>
          {pct != null && <span className="num w-8 text-right text-(--ink-2)">{pct}%</span>}
          {item.totalBytes != null && (
            <span className="num text-(--ink-3)">{formatFileSize(item.bytesReceived ?? 0)}/{formatFileSize(item.totalBytes)}</span>
          )}
        </span>
      )}

      {item.status === 'failed' && item.error && <span className="shrink-0 truncate text-(--ink-3)" title={item.error}>{item.error}</span>}

      {item.status === 'done' && (
        <button type="button" aria-label="Open file" title="Open file" onClick={() => onOpen(item.id)} className={iconBtn}>
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </button>
      )}
      {item.status === 'failed' && (item.hotlink ? (
        <button type="button" onClick={() => onRetryReferer(item.id)} className="shrink-0 text-(--ink-3) hover:text-(--ink)"
          title="Retry sending this page as the Referer (asks for permission the first time)">Retry w/ referer</button>
      ) : (
        <button type="button" aria-label="Retry" title="Retry" onClick={() => onRetry(item.id)} className={iconBtn}>
          <ArrowPathIcon className="h-3.5 w-3.5" />
        </button>
      ))}
      {(item.status === 'queued' || item.status === 'active') && (
        <button type="button" aria-label="Cancel" title="Cancel" onClick={() => onCancel(item.id)} className={iconBtn}>
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
