import { build } from 'npm:vite@^8.1.5';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Bundles `stream-entry.ts` (@mbd/core's HLS capture engine — hls.ts +
 * hls-webcrypto.ts, which pull in mux.ts/mp4box + the ssrf-guard + bounded-fetch
 * transitively) into a self-contained ESM the desktop backend can import by
 * relative path — same idiom as `buildCoreBundle` in `../build/collector.ts`
 * (`src/build/**` is permission-blocked for direct edits here, so this build
 * step lives as a sibling module in `core-bundle/` and is chained into the
 * `build:collector` deno task instead, mirroring how Phase-C's
 * `src/collector/deepscan.build.ts` is chained). DASH support is a later task.
 */
export async function buildStreamBundle(): Promise<void> {
  await build({
    root,
    logLevel: 'warn',
    build: {
      lib: {
        entry: fileURLToPath(new URL('./stream-entry.ts', import.meta.url)),
        formats: ['es'],
        fileName: () => 'stream.gen.js',
      },
      outDir: fileURLToPath(new URL('.', import.meta.url)),
      emptyOutDir: false,
      minify: false,
      rollupOptions: { external: [] },
    },
  });

  // Vite/Rollup emit plain JS with no type info. Prepend a `@ts-self-types`
  // directive so Deno associates the hand-written stream.gen.d.ts with this
  // generated file for every importer, without each import site needing its
  // own `@ts-types` comment — see download-name.gen.js in buildCoreBundle().
  const genPath = fileURLToPath(new URL('./stream.gen.js', import.meta.url));
  const bundled = await Deno.readTextFile(genPath);
  await Deno.writeTextFile(genPath, `// @ts-self-types="./stream.gen.d.ts"\n${bundled}`);
}

if (import.meta.main) {
  await buildStreamBundle();
  console.log('built core-bundle/stream.gen.js');
}
