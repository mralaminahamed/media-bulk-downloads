// Barrel for the @mbd/core package. Domain modules are imported via their
// subpaths (e.g. `@mbd/core/collection/canonical`, `@mbd/core/resolvers`,
// `@mbd/core/download/stream/hls`); this entry re-exports the shared types so
// `@mbd/core` alone resolves to the type vocabulary.
export type * from '@mbd/core/types';
