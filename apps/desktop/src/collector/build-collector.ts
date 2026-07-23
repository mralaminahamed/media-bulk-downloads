import { build } from 'npm:vite@^8.1.5';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export async function buildCollector(): Promise<void> {
  await build({
    root,
    logLevel: 'warn',
    build: {
      lib: {
        entry: fileURLToPath(new URL('./collector.entry.ts', import.meta.url)),
        name: '__mbdCollectorBundle',
        formats: ['iife'],
        fileName: () => 'collector.iife.js',
      },
      outDir: fileURLToPath(new URL('../../dist', import.meta.url)),
      emptyOutDir: false,
      minify: false,
    },
  });
}

if (import.meta.main) {
  await buildCollector();
  console.log('built dist/collector.iife.js');
}
