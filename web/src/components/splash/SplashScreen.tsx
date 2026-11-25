// AttendSure Web - Splash Screen Component
// File: D:\AttendSure_V3\web\src\components\splash\SplashScreen.tsx

/**
 * AttendSure - Circular Radar & Spiral Loader Splash Screen
 * File: web/src/components/splash/SplashScreen.tsx
 */

import React, { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { AttendSureBrandBadge } from '../branding/BrandAssets';

interface SplashScreenProps {
  loading: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

const SPIRAL_DOTS = Array.from({ length: 8 }, (_, index) => index);

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading,
  minDurationMs = 950,
  onFinish,
}) => {
  const { mode, tokens, brand, fonts } = useTheme();
  const [canExit, setCanExit] = useState(false);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

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
      }, 350);
      return () => clearTimeout(exitTimer);
    }
  }, [loading, canExit, onFinish]);

  if (hidden) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: tokens.bgCanvas,
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        pointerEvents: fading ? 'none' : 'auto',
        fontFamily: fonts.display,
        padding: '32px 24px 24px',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes radarPing {
          0% {
            transform: scale(0.95);
            opacity: 0.75;
          }
          100% {
            transform: scale(1.85);
            opacity: 0;
          }
        }
        @keyframes radarSweep {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes spiralDotPulse {
          0%, 100% {
            transform: scale(0.32);
            opacity: 0.2;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>

      {/* Top Spacer */}
      <div style={{ height: 20 }} />

      {/* Center Circular Radar Logo + Spiral Loader */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
          maxWidth: 340,
        }}
      >
        {/* Circular Radar Emblem Container */}
        <div
          style={{
            position: 'relative',
            width: 112,
            height: 112,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          {/* Expanding Radar Wave 1 */}
          <span
            style={{
              position: 'absolute',
              inset: 6,
              borderRadius: '50%',
              border: `2px solid ${brand.primary}`,
              animation: 'radarPing 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite',
              pointerEvents: 'none',
            }}
          />

          {/* Expanding Radar Wave 2 (Staggered) */}
          <span
            style={{
              position: 'absolute',
              inset: 6,
              borderRadius: '50%',
              border: `2px solid ${brand.secondary}`,
              animation: 'radarPing 2.4s cubic-bezier(0.16, 1, 0.3, 1) 1.2s infinite',
              pointerEvents: 'none',
            }}
          />

          {/* Rotating Radar Conic Sweep Ring */}
          <span
            style={{
              position: 'absolute',
              inset: 2,
              borderRadius: '50%',
              background: `conic-gradient(from 0deg, ${brand.primary}55 0deg, transparent 110deg, transparent 360deg)`,
              animation: 'radarSweep 2.2s linear infinite',
              pointerEvents: 'none',
            }}
          />

          {/* Solid Circular Logo Badge */}
          <AttendSureBrandBadge
            size={92}
            shape="circle"
            mode={mode}
            style={{
              position: 'relative',
              zIndex: 2,
              borderWidth: 2,
              borderColor: brand.primary,
              boxShadow: tokens.cardShadow,
            }}
          />
        </div>

        {/* Direct, Simple English Title */}
        <h1
          style={{
            margin: 0,
            fontSize: '2rem',
            fontWeight: 900,
            color: tokens.textPrimary,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          AttendSure
        </h1>

        <span
          style={{
            fontSize: '0.88rem',
            fontWeight: 600,
            color: tokens.textSecondary,
            marginTop: 6,
          }}
        >
          School Attendance System
        </span>

        {/* 8-Dot Spiral Loading Spinner */}
        <div
          role="status"
          aria-label="Loading"
          style={{
            position: 'relative',
            width: 44,
            height: 44,
            marginTop: 24,
          }}
        >
          {SPIRAL_DOTS.map((i) => {
            const angleDeg = i * 45;
            const delaySec = -(1.1 - i * 0.1375).toFixed(4);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `rotate(${angleDeg}deg)`,
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: 8,
                    height: 8,
                    margin: '0 auto',
                    borderRadius: '50%',
                    backgroundColor: tokens.textPrimary,
                    animation: `spiralDotPulse 1.1s ease-in-out ${delaySec}s infinite`,
                  }}
                />
              </div>
            );
          })}
        </div>

        <span
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: tokens.textMuted,
            marginTop: 10,
          }}
        >
          Please wait...
        </span>
      </div>

      {/* Bottom Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontSize: '0.76rem',
          color: tokens.textMuted,
          userSelect: 'none',
          paddingTop: 16,
        }}
      >
        <span>&copy; 2026 AttendSure</span>
        <span>&bull;</span>
        <span style={{ fontWeight: 800, color: tokens.textPrimary }}>
          TechBlazer
        </span>
      </div>
    </div>
  );
};

export default SplashScreen;
