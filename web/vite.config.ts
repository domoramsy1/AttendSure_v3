// AttendSure Web - Vite Build Configuration
// File: D:\AttendSure_V3\web\vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ServerResponse } from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    allowedHosts: [
      '.attendsure.com.ph',
      '.trycloudflare.com',
      'localhost',
      '127.0.0.1',
    ],
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
              const httpRes = res as ServerResponse;
              if (!httpRes.headersSent) {
                httpRes.writeHead(502, { 'Content-Type': 'application/json' });
                httpRes.end(
                  JSON.stringify({
                    error: 'The school server is temporarily unavailable. Please try again shortly.',
                  })
                );
              }
            }
          });
        },
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('axios')) {
              return 'vendor-network';
            }
          }
        },
      },
    },
  },
});
