import { buildBackup, parseBackup, BACKUP_APP, BACKUP_VERSION } from '@/extension/shared/storage/backup';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { FavouriteEntry, HistoryEntry } from '@/types';

const fav: FavouriteEntry = { src: 'https://a', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 1 };
const hist: HistoryEntry = { src: 'https://h', filename: 'x.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 2 };
const exc = { value: 'cdn.ads.com', kind: 'host' as const, time: 1 };

describe('buildBackup', () => {
  it('assembles a tagged, versioned backup with the given time', () => {
    const b = buildBackup(DEFAULT_SETTINGS, [fav], [hist], [], '2026-07-06T00:00:00Z');
    expect(b).toMatchObject({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: '2026-07-06T00:00:00Z' });
    expect(b.favourites).toEqual([fav]);
    expect(b.history).toEqual([hist]);
  });

  it('round-trips excluded', () => {
    const json = JSON.stringify(buildBackup(DEFAULT_SETTINGS, [fav], [hist], [exc], 't'));
    expect(parseBackup(json)!.excluded).toEqual([exc]);
  });

  it('defaults excluded to [] for a legacy backup', () => {
    const legacy = JSON.stringify({ app: BACKUP_APP, version: 1, settings: {}, favourites: [], history: [] });
    expect(parseBackup(legacy)!.excluded).toEqual([]);
  });
});

describe('parseBackup', () => {
  const valid = JSON.stringify(buildBackup(DEFAULT_SETTINGS, [fav], [hist], [], 't'));

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

  it('returns null when the parsed JSON is not an object (null or a primitive)', () => {
    expect(parseBackup('null')).toBeNull();
    expect(parseBackup('42')).toBeNull();
    expect(parseBackup('"just a string"')).toBeNull();
    expect(parseBackup('true')).toBeNull();
  });

  it('round-trips a backup with a mix of valid and corrupt favourites/history/excluded entries', () => {
    const json = JSON.stringify({
      app: BACKUP_APP,
      version: 2,
      exportedAt: 't',
      settings: { namingMode: 'plain' },
      favourites: [{ src: 'https://a', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 1 }, { noSrc: true }, null],
      history: [{ src: 'https://h', filename: 'x', kind: 'video', type: 'mp4', sourcePageUrl: 'p', time: 2 }, 'garbage', 7],
      excluded: [{ value: 'cdn.bad.com', kind: 'host', time: 1 }, { kind: 'url' }, 42, null],
    });
    const b = parseBackup(json);
    expect(b?.favourites).toEqual([{ src: 'https://a', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 1 }]);
    expect(b?.history).toEqual([{ src: 'https://h', filename: 'x', kind: 'video', type: 'mp4', sourcePageUrl: 'p', time: 2 }]);
    expect(b?.excluded).toEqual([{ value: 'cdn.bad.com', kind: 'host', time: 1 }]);
    expect(b?.settings.namingMode).toBe('plain');
    expect(b?.version).toBe(2);
  });

  it('drops entries that have no string src', () => {
    const b = parseBackup(JSON.stringify({ app: BACKUP_APP, favourites: [{ src: 'ok' }, { nope: 1 }, null, 7], history: [] }));
    expect(b?.favourites).toHaveLength(1);
    expect(b?.favourites[0].src).toBe('ok');
  });

  it('drops an excluded entry with a valid value but missing/invalid kind', () => {
    // Such an entry would restore into storage yet be filtered out of every read
    // (loadExcluded requires kind) — invisible in the panel and undeletable.
    const b = parseBackup(JSON.stringify({
      app: BACKUP_APP,
      excluded: [
        { value: 'cdn.ok.com', kind: 'host', time: 1 },
        { value: 'cdn.nokind.com', time: 2 },
        { value: 'cdn.badkind.com', kind: 'nope', time: 3 },
      ],
    }));
    expect(b?.excluded).toEqual([{ value: 'cdn.ok.com', kind: 'host', time: 1 }]);
  });

  it('coerces a non-numeric entry time to 0 (matching loadX)', () => {
    const b = parseBackup(JSON.stringify({ app: BACKUP_APP, favourites: [{ src: 'https://a', time: 'oops' }] }));
    expect(b?.favourites[0].time).toBe(0);
  });

  it('coerces missing settings/arrays through defaults', () => {
    const b = parseBackup(JSON.stringify({ app: BACKUP_APP }));
    expect(b?.favourites).toEqual([]);
    expect(b?.history).toEqual([]);
    expect(b?.settings).toMatchObject({ namingMode: 'prefixed', minimumImageSize: 0 });
    expect(b?.version).toBe(0); // unknown version tolerated
  });

  it('does not let a hostile __proto__ payload pollute Object.prototype', () => {
    const b = parseBackup(
      '{"app":"media-bulk-downloads",' +
        '"__proto__":{"polluted":"yes"},' +
        '"favourites":[{"src":"https://a","__proto__":{"polluted2":"yes"}}]}',
    );
    expect(b).not.toBeNull();
    // The malicious keys must not reach the global prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('drops a dangerous sourcePageUrl scheme from favourites and history (the panel <a href> sink)', () => {
    const b = parseBackup(JSON.stringify({
      app: BACKUP_APP,
      favourites: [{ src: 'https://a', sourcePageUrl: 'javascript:alert(1)', time: 1 }],
      history: [{ src: 'https://h', filename: 'x', sourcePageUrl: 'data:text/html,<script>', time: 2 }],
    }));
    expect(b?.favourites[0].sourcePageUrl).toBe('');
    expect(b?.history[0].sourcePageUrl).toBe('');
  });

  it('keeps an http(s) sourcePageUrl and a scheme-less/relative one (shown as raw text)', () => {
    const b = parseBackup(JSON.stringify({
      app: BACKUP_APP,
      favourites: [
        { src: 'https://a', sourcePageUrl: 'https://page.example/post', time: 1 },
        { src: 'https://b', sourcePageUrl: 'not a url', time: 2 },
      ],
    }));
    expect(b?.favourites[0].sourcePageUrl).toBe('https://page.example/post');
    expect(b?.favourites[1].sourcePageUrl).toBe('not a url');
  });

  it('strips control chars/whitespace that try to hide a javascript: scheme', () => {
    const b = parseBackup(JSON.stringify({
      app: BACKUP_APP,
      favourites: [
        { src: 'https://a', sourcePageUrl: 'java\tscript:alert(1)', time: 1 },
        { src: 'https://b', sourcePageUrl: '  javascript:alert(1)', time: 2 },
      ],
    }));
    expect(b?.favourites[0].sourcePageUrl).toBe('');
    expect(b?.favourites[1].sourcePageUrl).toBe('');
  });
});
