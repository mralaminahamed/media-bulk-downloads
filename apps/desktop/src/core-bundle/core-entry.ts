// Entry for the backend core bundle. `deno desktop`'s compile step does not
// resolve bare `@mbd/core/*` source imports (it mis-bases relative import-map
// entries and skips sloppy-imports — see docs/runtime-recipe.md), so the backend
// cannot import @mbd/core directly. We pre-bundle the value-imports it needs into
// a single self-contained ESM (download-name.gen.js) that main.ts/downloader.ts
// import by relative path — the same "embed, don't resolve at runtime" approach
// the collector IIFE uses.
export { buildDownloadFilename } from '@mbd/core/collection/download-name';
export {
  mergeHistory, mergeFavourites,
  HISTORY_CAP, HISTORY_MAX_BYTES, FAVOURITES_CAP, FAVOURITES_MAX_BYTES,
} from '@mbd/core/collection/entry-merge';
export { partitionByDownloaded } from '@mbd/core/collection/download-dedupe';
export { canonicalSrcKey, SrcKeySet } from '@mbd/core/collection/canonical';
