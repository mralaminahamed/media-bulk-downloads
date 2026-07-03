// External dependencies
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import zip from 'vite-plugin-zip-pack'

// Typed manifest source (emits dist/manifest.json via crxjs)
import manifest from './manifest.config'
import { version } from './package.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    zip({ inDir: 'dist', outDir: 'release', outFileName: `media-bulk-downloads-${version}.zip` }),
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
    hmr: {
      port: 3000,
    },
  },
});
