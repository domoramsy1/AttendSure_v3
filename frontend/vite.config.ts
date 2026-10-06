import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 80,
    allowedHosts: [
      'lapasan.attendsure.com.ph',
      'localhost',
    ],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2015',
      // Explicitly forces esbuild to convert ?. and ?? into older ternary checks
      supported: {
        'optional-chaining': false,
        'nullish-coalescing': false,
      },
    },
  },
});