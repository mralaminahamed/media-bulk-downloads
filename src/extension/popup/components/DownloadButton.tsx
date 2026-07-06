import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArchiveBoxArrowDownIcon, ChevronDownIcon, LinkIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

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
}

/**
 * Split primary button: click the main area to download separate files (the
 * long-standing default), or open the caret menu for the alternative actions on
 * the same set — ZIP, copy links, export links. The menu closes on
 * outside-click, Escape, or a selection.
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ label, count, disabled, onDownload, onZip, onCopyLinks, onExportLinks }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative flex-none">
      <div className="btn-group">
        <button
          onClick={onDownload}
          disabled={disabled}
          className="btn btn-primary"
          title="Download as separate files"
          // The count renders as a separate pill span, so spell the accessible
          // name out here — otherwise it reads as "Download5" with no space.
          aria-label={count != null ? `${label} ${count}` : label}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
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
          className="btn btn-primary px-2"
        >
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full mb-1.5 w-56 overflow-hidden rounded-(--radius-sm) border hairline bg-(--panel) py-1 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={choose(onDownload)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-(--ink) hover:bg-(--panel-2)"
          >
            <ArrowDownTrayIcon className="h-4 w-4 shrink-0 text-(--ink-2)" />
            <span>As separate files</span>
          </button>
          <button
            role="menuitem"
            onClick={choose(onZip)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-(--ink) hover:bg-(--panel-2)"
          >
            <ArchiveBoxArrowDownIcon className="h-4 w-4 shrink-0 text-(--ink-2)" />
            <span>As ZIP archive</span>
          </button>
          <div className="my-1 border-t hairline" role="separator" />
          <button
            role="menuitem"
            onClick={choose(onCopyLinks)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-(--ink) hover:bg-(--panel-2)"
          >
            <LinkIcon className="h-4 w-4 shrink-0 text-(--ink-2)" />
            <span>Copy links</span>
          </button>
          <button
            role="menuitem"
            onClick={choose(onExportLinks)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-(--ink) hover:bg-(--panel-2)"
          >
            <DocumentArrowDownIcon className="h-4 w-4 shrink-0 text-(--ink-2)" />
            <span>Export links (.txt)</span>
          </button>
        </div>
      )}
    </div>
  );
};
