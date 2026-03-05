import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
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
      '/users': 'http://localhost:3000',
    },
  },
});
