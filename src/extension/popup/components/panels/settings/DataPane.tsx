import React from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { DataPaneProps } from '@/types';

const DataPane: React.FC<DataPaneProps> = ({ onExport, onImportFile, fileInputRef, backupNote }) => (
  <section
    role="tabpanel"
    id="settings-panel-data"
    aria-labelledby="settings-tab-data"
    className="space-y-3"
  >
    <p className="text-[11px] leading-relaxed text-(--ink-3)">
      Save your settings, favourites, history, and blocked sources to a JSON file, or
      restore from a previous backup. Importing <strong>replaces</strong> your current
      favourites, history, and blocked sources. Everything stays on your device.
    </p>
    <div className="flex flex-wrap gap-2">
      <button onClick={onExport} className="btn btn-ghost btn-sm">
        <ArrowDownTrayIcon className="h-4 w-4" />
        <span>Export backup</span>
      </button>
      <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost btn-sm">
        <ArrowUpTrayIcon className="h-4 w-4" />
        <span>Import backup</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={onImportFile}
        className="hidden"
      />
    </div>
    {backupNote && (
      <p aria-live="polite" className="text-[11px] text-(--ink-2)">
        {backupNote}
      </p>
    )}
  </section>
);

export default DataPane;
