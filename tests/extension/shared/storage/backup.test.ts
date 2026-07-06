import { buildBackup, parseBackup, BACKUP_APP, BACKUP_VERSION } from '@/extension/shared/storage/backup';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { FavouriteEntry, HistoryEntry } from '@/types';

const fav: FavouriteEntry = { src: 'https://a', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 1 };
const hist: HistoryEntry = { src: 'https://h', filename: 'x.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 2 };

describe('buildBackup', () => {
  it('assembles a tagged, versioned backup with the given time', () => {
    const b = buildBackup(DEFAULT_SETTINGS, [fav], [hist], '2026-07-06T00:00:00Z');
    expect(b).toMatchObject({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: '2026-07-06T00:00:00Z' });
    expect(b.favourites).toEqual([fav]);
    expect(b.history).toEqual([hist]);
  });
});

describe('parseBackup', () => {
  const valid = JSON.stringify(buildBackup(DEFAULT_SETTINGS, [fav], [hist], 't'));

  it('parses a valid backup and restores its entries + settings', () => {
    const b = parseBackup(valid);
    expect(b?.favourites[0].src).toBe('https://a');
    expect(b?.history[0].src).toBe('https://h');
    expect(b?.settings.namingMode).toBe('prefixed');
  });

  it('returns null for non-JSON', () => {
    expect(parseBackup('{ not valid')).toBeNull();
    expect(parseBackup('')).toBeNull();
  });

  it('returns null when the app tag is missing or wrong', () => {
    expect(parseBackup(JSON.stringify({ favourites: [], history: [] }))).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'some-other-tool', favourites: [], history: [] }))).toBeNull();
  });

  it('drops entries that have no string src', () => {
    const b = parseBackup(JSON.stringify({ app: BACKUP_APP, favourites: [{ src: 'ok' }, { nope: 1 }, null, 7], history: [] }));
    expect(b?.favourites).toHaveLength(1);
    expect(b?.favourites[0].src).toBe('ok');
  });

  it('coerces missing settings/arrays through defaults', () => {
    const b = parseBackup(JSON.stringify({ app: BACKUP_APP }));
    expect(b?.favourites).toEqual([]);
    expect(b?.history).toEqual([]);
    expect(b?.settings).toMatchObject({ namingMode: 'prefixed', minimumImageSize: 0 });
    expect(b?.version).toBe(0); // unknown version tolerated
  });
});
