import { basename } from 'jsr:@std/path';
import type { Store } from '../storage/kv.ts';
import { recordDownloads } from '../storage/history.ts';
import { downloadOne } from './downloader.ts';

interface QueueItem {
  src: string;
  ext?: string;
  type?: string;
  kind?: 'image' | 'video' | 'audio';
  sourcePage?: { url?: string };
}

interface Deps {
  store: Store;
  root: string;
  template: string;
  namingMode: 'prefixed' | 'original';
  fileNamePrefix: string;
  concurrency: number;
  sourcePageUrl?: string;
  downloadImpl?: typeof downloadOne;
  backoffMs?: (attempt: number) => number;
}

export interface Queue {
  enqueue(items: QueueItem[]): Promise<void>;
  status(): { pending: number; active: number; done: number; failed: number };
  drain(): Promise<void>;
  resume(): Promise<void>;
}

const KEY = 'downloadQueue';

export function createQueue(deps: Deps): Queue {
  const dl = deps.downloadImpl ?? downloadOne;
  const backoff = deps.backoffMs ?? ((a: number) => Math.min(1000 * 2 ** a, 15000));
  let pending: QueueItem[] = [];
  let active = 0, done = 0, failed = 0;
  let idleResolvers: Array<() => void> = [];

  const persist = () => deps.store.durableSet(KEY, pending);
  const settleIdle = () => {
    if (active === 0 && pending.length === 0) {
      idleResolvers.forEach((r) => r());
      idleResolvers = [];
    }
  };

  async function runOne(item: QueueItem): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { path } = await dl(item, {
          root: deps.root,
          template: deps.template,
          index: 0,
          namingMode: deps.namingMode,
          fileNamePrefix: deps.fileNamePrefix,
          sourcePageUrl: item.sourcePage?.url ?? deps.sourcePageUrl,
        });
        await recordDownloads(deps.store, [{
          src: item.src,
          filename: basename(path) || item.src,
          kind: item.kind ?? 'image',
          type: item.type ?? '',
          sourcePageUrl: item.sourcePage?.url ?? deps.sourcePageUrl ?? '',
          time: Date.now(),
          path,
        }]);
        done++;
        return;
      } catch {
        if (attempt === 2) {
          failed++;
          return;
        }
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
    }
  }

  function pump(): void {
    while (active < deps.concurrency && pending.length) {
      const item = pending.shift()!;
      void persist();
      active++;
      void runOne(item).finally(() => {
        active--;
        void persist();
        pump();
        settleIdle();
      });
    }
    settleIdle();
  }

  return {
    async enqueue(items: QueueItem[]) {
      pending.push(...items);
      await persist();
      pump();
    },
    status() {
      return { pending: pending.length, active, done, failed };
    },
    drain() {
      return active === 0 && pending.length === 0
        ? Promise.resolve()
        : new Promise<void>((res) => idleResolvers.push(res));
    },
    async resume() {
      pending = (await deps.store.durableGet<QueueItem[]>(KEY)) ?? [];
      pump();
    },
  };
}
