// AttendSure Web - Application Entry Point
// File: D:\AttendSure_V3\web\src\main.tsx

/**
 * AttendSure - Instant-Mount Application Entry Point
 * File: web/src/main.tsx
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BRAND_ASSETS } from './components/branding/BrandAssets';

// Mount React immediately on Frame 1 before running optional favicon work
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Generate circular high-contrast favicon only when main thread is idle
const applyAppFavicon = () => {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = BRAND_ASSETS.attendsureLogo;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#e2e8f0';
        ctx.stroke();
        ctx.drawImage(img, 10, 10, 44, 44);

        const pngDataUrl = canvas.toDataURL('image/png');
        document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());

        const link = document.createElement('link');
        link.type = 'image/png';
        link.rel = 'icon';
        link.href = pngDataUrl;
        document.head.appendChild(link);
      } catch {
        // Keep inline SVG icon from index.html
      }
    };
  } catch {
    // Non-blocking fallback
  }
};

if (typeof window !== 'undefined') {
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(applyAppFavicon);
  else setTimeout(applyAppFavicon, 600);
}
