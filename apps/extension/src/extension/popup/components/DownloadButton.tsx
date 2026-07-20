import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArchiveBoxArrowDownIcon, ChevronDownIcon, LinkIcon, DocumentArrowDownIcon, NoSymbolIcon } from '@heroicons/react/24/outline';

interface DownloadButtonProps {
  /** Primary button text, e.g. "Download" or "Download selected". */
  label: string;
  /** Item count shown as a pill after the label. Omitted → no pill (e.g. nothing to download). */
  count?: number;
  disabled?: boolean;
  /** Default action — download as separate files. */
  onDownload: () => void;
  /** Bundle the same set into a single ZIP archive. */
  onZip: () => void;
  /** Copy the same set's URLs to the clipboard. */
  onCopyLinks: () => void;
  /** Export the same set's URLs as a .txt file. */
  onExportLinks: () => void;
  /** Add the same set's sources to the exclusion list. Only offered when provided (the selection variant). */
  onExclude?: () => void;
}

/**
 * Split primary button: click the main area to download separate files (the
 * long-standing default), or open the caret menu for the alternative actions on
 * the same set — ZIP, copy links, export links. The menu closes on
 * outside-click, Escape, or a selection.
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ label, count, disabled, onDownload, onZip, onCopyLinks, onExportLinks, onExclude }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent): void => {
      if (ref.current && !e.composedPath().includes(ref.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (fn: () => void) => (): void => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="mbd:relative mbd:flex-none">
      <div className="btn-group">
        <button
          onClick={onDownload}
          disabled={disabled}
          className="btn btn-primary"
          title="Download as separate files"
          aria-label={count != null ? `${label} ${count}` : label}
        >
          <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
          <span>{label}</span>
          {count != null && <span className="countpill">{count}</span>}
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More download options"
          title="More download options"
          className="btn btn-primary mbd:px-2"
        >
          <ChevronDownIcon className={`mbd:h-4 mbd:w-4 mbd:transition-transform ${open ? 'mbd:rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="mbd:absolute mbd:right-0 mbd:bottom-full mbd:mb-1.5 mbd:w-56 mbd:overflow-hidden mbd:rounded-(--radius-sm) mbd:border hairline mbd:bg-(--panel) mbd:py-1 mbd:shadow-lg"
        >
          <button
            role="menuitem"
            onClick={choose(onDownload)}
            className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-[13px] mbd:text-(--ink) mbd:hover:bg-(--panel-2)"
          >
            <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
            <span>As separate files</span>
          </button>
          <button
            role="menuitem"
            onClick={choose(onZip)}
            className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-[13px] mbd:text-(--ink) mbd:hover:bg-(--panel-2)"
          >
            <ArchiveBoxArrowDownIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
            <span>As ZIP archive</span>
          </button>
          <div className="mbd:my-1 mbd:border-t hairline" role="separator" />
          <button
            role="menuitem"
            onClick={choose(onCopyLinks)}
            className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-[13px] mbd:text-(--ink) mbd:hover:bg-(--panel-2)"
          >
            <LinkIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
            <span>Copy links</span>
          </button>
          <button
            role="menuitem"
            onClick={choose(onExportLinks)}
            className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-[13px] mbd:text-(--ink) mbd:hover:bg-(--panel-2)"
          >
            <DocumentArrowDownIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
            <span>Export links (.txt)</span>
          </button>
          {onExclude && (
            <>
              <div className="mbd:my-1 mbd:border-t hairline" role="separator" />
              <button
                role="menuitem"
                onClick={choose(onExclude)}
                className="mbd:flex mbd:w-full mbd:items-center mbd:gap-2.5 mbd:px-3 mbd:py-2 mbd:text-left mbd:text-[13px] mbd:text-(--ink) mbd:hover:bg-(--panel-2)"
              >
                <NoSymbolIcon className="mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--ink-2)" />
                <span>Exclude</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
