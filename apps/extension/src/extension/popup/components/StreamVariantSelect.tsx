import React from 'react';
import type { VariantState } from '@/extension/popup/hooks/useStreamVariants';

/**
 * The per-stream rendition picker (#314). A compact <select> shown for video
 * stream items in both the grid tile and the preview panel. It stays collapsed to
 * "Auto (global)" until opened; the FIRST focus triggers `onEnsure`, which lazily
 * fetches the master's renditions (never on render). Picking a height reports it
 * up as a `quality` override; re-selecting Auto reports null. A single-rendition
 * stream simply lists Auto with no alternates (the fetch found ≤1 height).
 */
interface Props {
  state: VariantState;
  value: number | null;
  onEnsure: () => void;
  onChange: (height: number | null) => void;
  className?: string;
}

const StreamVariantSelect: React.FC<Props> = ({ state, value, onEnsure, onChange, className }) => (
  <select
    className={className ?? 'mbd:text-[11px]'}
    value={value == null ? 'auto' : String(value)}
    aria-label="Stream quality"
    title="Stream quality"
    onFocus={() => { if (state.status === 'idle') onEnsure(); }}
    onMouseDown={() => { if (state.status === 'idle') onEnsure(); }}
    onChange={(e) => onChange(e.target.value === 'auto' ? null : Number(e.target.value))}
  >
    <option value="auto">Auto{state.status === 'loading' ? ' — loading…' : ' (global)'}</option>
    {state.variants.map((v) => (
      <option key={v.height} value={String(v.height)}>{v.label}</option>
    ))}
  </select>
);

export default StreamVariantSelect;
