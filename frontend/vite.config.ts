import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/chat': 'http://localhost:3000',
      '/pipeline': 'http://localhost:3000',
      '/jobs': 'http://localhost:3000',
      '/profile': 'http://localhost:3000',
      '/handshake': 'http://localhost:3000',
    },
  },
});
