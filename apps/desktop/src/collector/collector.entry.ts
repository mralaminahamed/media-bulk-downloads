import { collectMedia } from '@mbd/core/collection/collect';

declare global {
  // eslint-disable-next-line no-var
  var __mbdCollect: (opts?: {
    smartPageDefaults?: boolean;
    resolveOriginals?: boolean;
    excludeHostId?: string;
  }) => unknown;
}

globalThis.__mbdCollect = (opts) => collectMedia(undefined, opts);
