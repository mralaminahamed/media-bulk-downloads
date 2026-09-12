---
title: "Backup & restore"
description: "Export and import your settings, favourites, history, and blocked sources as one JSON file, plus reset and clear."
---

Everything the extension remembers stays on your device. To move it to another
browser or machine, or to keep a copy, export it to a single JSON file and import
it back later. Both live under **Settings → Data**.

A backup holds four things:

- Your settings
- Favourites
- Download history
- Blocked sources (the excluded URLs and hosts)

## Export a backup

Under **Settings → Data**, click **Export backup**. The extension writes a file
named `media-bulk-downloads-backup-YYYY-MM-DD.json` to your Downloads folder.

Signed-URL secrets (short-lived tokens some CDNs put in a media URL) are stripped
from the exported favourites and history, because the file is written to disk and
may be shared or synced. An entry whose URL was stripped is marked so it isn't
offered for re-download from the restored copy, but its source page and identity
are kept, so you can still find your way back to the media.

## Import a backup

Under **Settings → Data**, click **Import backup** and pick a backup file.

Importing **replaces** your current favourites, history, and blocked sources with
the ones in the file, and applies the file's settings. Everything stays on your
device. The importer is lenient: an older or hand-edited backup still restores,
with each field run through the same validation a normal load uses. If the file
isn't a Media Bulk Downloads backup, the extension says so and changes nothing.

After a successful import, a line confirms how many favourites, history entries,
and blocked sources were restored.

## Reset and clear

Two more actions live under **Settings → Data**, both separate from backups:

| Action | What it does | What it keeps |
|--------|--------------|---------------|
| Reset settings | Restores every setting to its default | Favourites, history, and blocked sources |
| Clear all data | Deletes favourites, history, and blocked sources | Your settings |

Use **Reset settings** to get back to defaults without losing your saved media
lists. Use **Clear all data** to wipe those lists while keeping how the extension
is configured.

## Example: move your setup to another machine

1. On the first machine, open **Settings → Data** and click **Export backup**.
2. Copy the downloaded JSON file to the second machine.
3. On the second machine, install the extension, then open **Settings → Data**
   and click **Import backup**.
4. Pick the file. Your settings, favourites, history, and blocked sources are
   restored, replacing whatever was there.

## Related

- [Favourites](/media-bulk-downloads/guides/favourites/) for what favourites store.
- [Download History](/media-bulk-downloads/guides/history/) for what history records.
- [FAQ & troubleshooting](/media-bulk-downloads/help/faq/) for where data lives and privacy.

---
