import { BackupData, ExcludedEntry, FavouriteEntry, HistoryEntry, SettingsData } from '@mbd/core/types';
import { withDefaults } from '@mbd/storage/settings';

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

/**
 * `sourcePageUrl` is rendered as an `<a href>` in the History/Favourites panels,
 * so a hostile backup could smuggle a `javascript:`/`data:` scheme into that
 * sink. Drop any value carrying a non-http(s) scheme (leading control chars and
 * whitespace stripped first so `java\tscript:` / ` javascript:` can't hide one);
 * relative/scheme-less values — which the panel intentionally shows as raw
 * text — are kept.
 */
function safeSourceUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  // Stripping the C0 control range + space is intentional (a scheme can't hide
  // behind them); eslint flags the control chars in the character class.
  // eslint-disable-next-line no-control-regex
  const scheme = v.replace(/[\u0000-\u0020]/g, '').match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && scheme[1].toLowerCase() !== 'http' && scheme[1].toLowerCase() !== 'https') return '';
  return v;
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

/** Coerce a stored media entry: numeric time, and an href-safe sourcePageUrl. */
function normalizeEntry<T extends { time?: unknown; sourcePageUrl?: unknown }>(e: T): T {
  const out = { ...e, time: Number(e.time) || 0 } as T & { sourcePageUrl?: string };
  if ('sourcePageUrl' in e) out.sourcePageUrl = safeSourceUrl(e.sourcePageUrl);
  return out;
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
    // Coerce time (like loadX does) so a bad/missing timestamp can't feed NaN into
    // the newest-first sort + cap on restore, and drop dangerous sourcePageUrl
    // schemes before they reach the panel's <a href>.
    favourites: Array.isArray(obj.favourites)
      ? (obj.favourites.filter(hasStringSrc).map(normalizeEntry) as FavouriteEntry[])
      : [],
    history: Array.isArray(obj.history)
      ? (obj.history.filter(hasStringSrc).map(normalizeEntry) as HistoryEntry[])
      : [],
    // Require a valid kind (matching loadExcluded) — an entry with a valid value
    // but missing/invalid kind would restore into storage yet be filtered out of
    // every read: invisible in the panel, matching nothing, undeletable, and
    // permanently consuming a cap/byte-budget slot.
    excluded: Array.isArray(obj.excluded)
      ? (obj.excluded
          .filter((e): e is ExcludedEntry =>
            !!e && typeof e === 'object' &&
            typeof (e as ExcludedEntry).value === 'string' &&
            ((e as ExcludedEntry).kind === 'url' || (e as ExcludedEntry).kind === 'host'))
          .map((e) => ({ ...e, time: Number(e.time) || 0 })) as ExcludedEntry[])
      : [],
  };
}
