---
title: "Select & bulk actions"
description: "Pick exactly the items you want with per-item ticks and shift-click ranges, then download, ZIP, copy links, or exclude the selection."
---

Downloading everything shown is one click, but often you want a subset. Ticking
items turns the footer's download control into a selection tool: whatever you pick
is what gets saved, zipped, copied, or excluded.

## Selecting items

- **Tick one** item by its checkbox to add it to the selection.
- **Shift-click** a second item to select the whole run between the two, so you
  can grab a block without ticking each one.
- **Select all shown** with the checkbox in the footer. It selects every
  downloadable item currently in the grid, so filters apply first: filter the
  grid down, then select all to select just that subset.

Only real, downloadable items can be selected. Poster-only items still waiting on
a network resolve and stream-capture placeholders are skipped, so a bulk download
never queues something that has no file yet.

Your selection is scoped to what is shown. If you change a filter and an item
leaves the grid, it also leaves the selection, so the count always matches what
you can see.

## Acting on a selection

With items selected, the footer button reads **Download selected** with a count.
Click it to save them as separate files, or open the caret menu next to it for the
other actions on the same set:

| Action | What it does |
|---|---|
| As separate files | Save each selected item as its own download (the default). |
| As ZIP archive | Bundle the selection into one ZIP. Files a CDN blocks fall back to individual downloads. |
| Copy links | Copy every selected URL to the clipboard. |
| Export links (.txt) | Save the selected URLs as a plain-text file, one per line. |
| Exclude | Add the selected sources to your blocklist so they never show up again. See [Blocked sources](/media-bulk-downloads/guides/blocked-sources/). |

The same caret menu is on the main download button when nothing is selected, so
copy-links and export-links work on the whole filtered set too. **Exclude** is
offered only for a selection.

## No selection

When nothing is ticked, the footer button acts on everything shown. So the normal
flow of scan, filter, download all still works without touching selection at all;
selection is only there when you want less than everything.

## Related

- [Filter, search & sort](/media-bulk-downloads/guides/filter-search-sort/) to narrow the grid before selecting.
- [Download & queue](/media-bulk-downloads/guides/download/) for how files are named and saved.
- [Blocked sources](/media-bulk-downloads/guides/blocked-sources/) for the exclusion list.

---
