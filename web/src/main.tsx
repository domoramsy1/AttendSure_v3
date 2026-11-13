/**
 * AttendSure V3 - Application Entry Point
 * File: web/src/main.tsx
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import appLogoSrc from './assets/attendsure-logo.svg';

// Dynamically generate a high-contrast PNG favicon from SVG emblem
const applyAppFavicon = () => {
  try {
    const img = new Image();
    img.src = appLogoSrc;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Circular background badge for clear contrast on dark browser tabs
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#e2e8f0';
        ctx.stroke();

        // Render AttendSure emblem centered
        ctx.drawImage(img, 10, 10, 44, 44);

        const pngDataUrl = canvas.toDataURL('image/png');

        // Safely remove existing icon links to prevent duplicate DOM tags
        const existingIcons = document.querySelectorAll("link[rel*='icon']");
        existingIcons.forEach((el) => el.remove());

        // Inject new favicon link
        const link = document.createElement('link');
        link.type = 'image/png';
        link.rel = 'icon';
        link.href = pngDataUrl;
        document.head.appendChild(link);
      } catch (err) {
        // Fallback silently if canvas operations fail
      }
    };

    img.onerror = () => {
      // Keep existing default favicon if image load fails
    };
  } catch {
    // Top-level error catch prevents favicon logic from blocking UI render
  }
};

// Apply high-contrast favicon
applyAppFavicon();

// Mount root React application
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}