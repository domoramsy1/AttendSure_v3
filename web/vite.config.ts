import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 80, // Binds to default HTTP port so no :5173 is required
    host: true, // Listens on 0.0.0.0
    strictPort: true,
    allowedHosts: [
      'lapasan.attendsure.com.ph',
      '.attendsure.com.ph',
      '.trycloudflare.com',
      'localhost',
      '127.0.0.1',
    ],
    fs: {
      allow: ['..'],
    },
    // Forwards API and media calls seamlessly to Django on port 8000
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});