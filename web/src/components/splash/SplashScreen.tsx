/**
 * AttendSure V3 - Minimalist Splash Screen (Light Mode Default)
 * File: web/src/components/splash/SplashScreen.tsx
 */

import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  loading: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading,
  minDurationMs = 600,
  onFinish,
}) => {
  const [canExit, setCanExit] = useState(false);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Defaults to false (Light Mode) unless dark mode was explicitly saved
  const [isDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const docTheme = document.documentElement.getAttribute('data-theme');
    if (docTheme === 'dark') return true;
    if (docTheme === 'light') return false;

    const saved = localStorage.getItem('attendsure_theme') || localStorage.getItem('attendsure_theme_preference');
    return saved === 'dark';
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setCanExit(true);
    }, minDurationMs);
    return () => clearTimeout(timer);
  }, [minDurationMs]);

  useEffect(() => {
    if (!loading && canExit) {
      setFading(true);
      const exitTimer = setTimeout(() => {
        setHidden(true);
        if (onFinish) onFinish();
      }, 300);
      return () => clearTimeout(exitTimer);
    }
  }, [loading, canExit, onFinish]);

  if (hidden) return null;

  const bgColor = isDark ? '#070b14' : '#f1f5f9';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bgColor,
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: fading ? 'none' : 'auto',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: 72,
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <img
            src="/splash.svg"
            alt="AttendSure Logo"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => {
              e.currentTarget.src = '/public/splash.svg';
            }}
          />
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 800,
            color: textColor,
            letterSpacing: '-0.03em',
          }}
        >
          AttendSure
        </h1>

        <span
          style={{
            fontSize: '0.74rem',
            fontWeight: 600,
            color: mutedColor,
            marginTop: 4,
          }}
        >
          Campus Attendance &amp; Security
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.72rem',
          color: mutedColor,
          userSelect: 'none',
        }}
      >
        <span>&copy; 2026 AttendSure</span>
        <span>&bull;</span>
        <span style={{ fontWeight: 700, color: isDark ? '#94a3b8' : '#475569' }}>
          TechBlazer
        </span>
      </div>
    </div>
  );
};

export default SplashScreen;