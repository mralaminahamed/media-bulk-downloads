import { collectMedia } from '@mbd/core/collection/collect';

export function main(): void {
  console.log('mbd desktop', typeof collectMedia);
}

if (import.meta.main) main();
