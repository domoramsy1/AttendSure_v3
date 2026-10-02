import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import appLogoSrc from './assets/AppLogo.svg';

// Dynamically generate a high-contrast PNG favicon from AppLogo.svg
const applyAppFavicon = () => {
  const img = new Image();
  img.src = appLogoSrc;

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw white circular background badge for high contrast on dark tabs
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Draw the AttendSure arch emblem centered
    ctx.drawImage(img, 10, 10, 44, 44);

    // Convert to PNG data URI
    const pngDataUrl = canvas.toDataURL('image/png');

    // Remove any existing broken icon links
    const existingIcons = document.querySelectorAll("link[rel*='icon']");
    existingIcons.forEach((el) => el.remove());

    // Inject fresh link tag
    const link = document.createElement('link');
    link.type = 'image/png';
    link.rel = 'icon';
    link.href = pngDataUrl;
    document.head.appendChild(link);
  };
};

applyAppFavicon();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);