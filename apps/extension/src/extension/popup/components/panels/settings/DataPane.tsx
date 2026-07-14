import React from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { DataPaneProps } from '@mbd/core/types';

const DataPane: React.FC<DataPaneProps> = ({ onExport, onImportFile, fileInputRef, backupNote }) => (
  <section
    role="tabpanel"
    id="settings-panel-data"
    aria-labelledby="settings-tab-data"
    className="mbd:space-y-3"
  >
    <p className="mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
      Save your settings, favourites, history, and blocked sources to a JSON file, or
      restore from a previous backup. Importing <strong>replaces</strong> your current
      favourites, history, and blocked sources. Everything stays on your device.
    </p>
    <div className="mbd:flex mbd:flex-wrap mbd:gap-2">
      <button onClick={onExport} className="btn btn-ghost btn-sm">
        <ArrowDownTrayIcon className="mbd:h-4 mbd:w-4" />
        <span>Export backup</span>
      </button>
      <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost btn-sm">
        <ArrowUpTrayIcon className="mbd:h-4 mbd:w-4" />
        <span>Import backup</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={onImportFile}
        className="mbd:hidden"
      />
    </div>
    {backupNote && (
      <p aria-live="polite" className="mbd:text-[11px] mbd:text-(--ink-2)">
        {backupNote}
      </p>
    )}
  </section>
);

export default DataPane;
