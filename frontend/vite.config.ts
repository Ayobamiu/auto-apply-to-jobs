import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // This is for development (npm run dev)
    proxy: {
      '/auth': 'http://localhost:3000',
      '/chat': 'http://localhost:3000',
      '/pipeline': 'http://localhost:3000',
      '/jobs': 'http://localhost:3000',
      '/profile': 'http://localhost:3000',
      '/handshake': 'http://localhost:3000',
      '/users': 'http://localhost:3000',
    },
  },
  preview: {
    // This is for production preview (npm run preview)
    allowedHosts: true,
    host: '0.0.0.0',
    port: 4173,
  }
});