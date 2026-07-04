// External dependencies
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import zip from 'vite-plugin-zip-pack'

// Typed manifest source (emits dist/manifest.json via crxjs)
import manifest from './manifest.config'
import { version } from './package.json'

// `command` is 'serve' for `vite` (dev) and 'build' for `vite build`.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    crx({ manifest }),
    // Packaging the release zip only makes sense for a production build. Running
    // it during `vite dev` re-zips dist on rebuilds — wasted work that adds to the
    // dev server's memory churn.
    ...(command === 'build'
      ? [zip({ inDir: 'dist', outDir: 'release', outFileName: `media-bulk-downloads-${version}.zip` })]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: './postcss.config.js',
  },
  build: {
    rollupOptions: {
      input: {
        popup: 'index.html',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  server: {
    port: 3000,
    strictPort: true,
    // HMR is served over the dev server port by default; an explicit `hmr` block
    // is redundant and the port/host sub-options are deprecated in Vite 8.
  },
}));
