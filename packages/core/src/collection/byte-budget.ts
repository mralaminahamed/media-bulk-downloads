/**
 * Serialized-size budgeting for the chrome.storage.local stores. A count cap
 * alone doesn't bound bytes (an entry's `src`/`thumbnailSrc` can be a full
 * base64 data URL), and the shared local quota is ~5MB with no unlimitedStorage,
 * so history / favourites / excluded / the download queue each bound their
 * newest-first list by serialized size too.
 *
 * Size is measured in UTF-8 bytes — the unit chrome.storage.local actually
 * quotas against. `JSON.stringify(x).length` counts UTF-16 code units, which
 * undercounts multi-byte text (CJK/Cyrillic/Arabic ≈ 3× under, emoji ≈ 2×): a
 * page title copied into an entry is routinely non-Latin, so that error is not
 * an edge case and can let a store believe it is under budget while the real
 * payload is far larger.
 */

const encoder = new TextEncoder();

/** UTF-8 byte length of a value's JSON serialization. */
export function jsonByteSize(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

/**
 * Keep leading entries until the cumulative UTF-8 byte budget is exceeded;
 * always keeps at least one entry even if it alone is over budget. Callers pass
 * the list already ordered by keep-priority (newest-first).
 */
export function withinByteBudget<T>(entries: T[], maxBytes: number): T[] {
  let total = 0;
  const out: T[] = [];
  for (const entry of entries) {
    total += jsonByteSize(entry);
    if (total > maxBytes && out.length) break;
    out.push(entry);
  }
  return out;
}
