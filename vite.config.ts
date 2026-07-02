// External dependencies
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'path'

// Internal manifest.json file
import manifest from './src/manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
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
