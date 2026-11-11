import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SAHAASRA_API lets a second copy of the app talk to the test API (defaults to the dev API on port 4000).
const api = process.env.SAHAASRA_API ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // The printer program and the API are separate projects; don't watch their build files.
    watch: { ignored: ['**/print-helper/**', '**/backend/**', '**/public/downloads/**'] },
    // The API server (backend/) runs on port 4000; same-origin requests keep the session cookie simple and safe.
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  preview: {
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
  },
});
