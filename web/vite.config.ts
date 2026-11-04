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
    port: 80, // Default HTTP port
    host: true, // Listen on all network interfaces (0.0.0.0)
    strictPort: true,
    // Protect against host-header injection and unauthorized tunnels
    allowedHosts: [
      'lapasan.attendsure.com.ph',
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
          proxy.on('error', (err, _req, res) => {
            // Guard: verify res is an HTTP response before writing headers
            if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
              const httpRes = res as ServerResponse;
              if (!httpRes.headersSent) {
                httpRes.writeHead(502, { 'Content-Type': 'application/json' });
                httpRes.end(
                  JSON.stringify({
                    error: 'Backend offline or restarting',
                    detail: err.message,
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
    sourcemap: false, // Cybersecurity: prevent source code leaks in production
    rollupOptions: {
      output: {
        // Universal function syntax compatible with all Vite and Rollup releases
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