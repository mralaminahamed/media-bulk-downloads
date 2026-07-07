import { BackupData, ExcludedEntry, FavouriteEntry, HistoryEntry, SettingsData } from '@/types';
import { withDefaults } from './settings';

/**
 * Import / export of the user's data (settings + favourites + history) as one
 * portable JSON file. `parseBackup` is deliberately lenient: it only requires
 * the app tag and coerces everything else through the same defaults/validation
 * a normal load would apply, so a hand-edited or older backup still restores
 * cleanly rather than throwing.
 */

export const BACKUP_APP = 'media-bulk-downloads';
export const BACKUP_VERSION = 1;

/** Whether a value looks like a stored media entry (favourite or history). */
function hasStringSrc(entry: unknown): entry is { src: string } {
  return !!entry && typeof entry === 'object' && typeof (entry as { src?: unknown }).src === 'string';
}

/** Assemble a backup object. `exportedAt` is injected so callers stamp the time. */
export function buildBackup(
  settings: SettingsData,
  favourites: FavouriteEntry[],
  history: HistoryEntry[],
  excluded: ExcludedEntry[],
  exportedAt: string,
): BackupData {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, settings, favourites, history, excluded };
}

/**
 * Parse + validate a backup file's text. Returns null when the text isn't valid
 * JSON or isn't one of our backups; otherwise returns a normalized BackupData
 * (settings run through `withDefaults`, entries filtered to those with a `src`).
 */
export function parseBackup(json: string): BackupData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<BackupData>;
  if (obj.app !== BACKUP_APP) return null;

  return {
    app: BACKUP_APP,
    version: typeof obj.version === 'number' ? obj.version : 0,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    settings: withDefaults((obj.settings ?? {}) as Partial<SettingsData>),
    favourites: Array.isArray(obj.favourites) ? (obj.favourites.filter(hasStringSrc) as FavouriteEntry[]) : [],
    history: Array.isArray(obj.history) ? (obj.history.filter(hasStringSrc) as HistoryEntry[]) : [],
    excluded: Array.isArray(obj.excluded)
      ? (obj.excluded.filter((e): e is ExcludedEntry => !!e && typeof e === 'object' && typeof (e as ExcludedEntry).value === 'string') as ExcludedEntry[])
      : [],
  };
}
