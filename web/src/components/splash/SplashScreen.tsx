import React, { useEffect, useState } from 'react';
import AttendSureBadge from '../branding/AttendSureBadge';
import TechBlazerSignature from '../branding/TechBlazerSignature';

interface SplashScreenProps {
  loading: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading,
  minDurationMs = 2500,
  onFinish,
}) => {
  const [canExit, setCanExit] = useState(false);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Enforces minimum view time
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanExit(true);
    }, minDurationMs);
    return () => clearTimeout(timer);
  }, [minDurationMs]);

  // Triggers exit transition when both data and duration finish
  useEffect(() => {
    if (!loading && canExit) {
      setFading(true);
      const exitTimer = setTimeout(() => {
        setHidden(true);
        if (onFinish) onFinish();
      }, 500); // 500ms fade-out transition
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
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* Product Center Emblem */}
      <AttendSureBadge size={96} animate />

      {/* Developer Corporate Signature */}
      <div style={{ position: 'absolute', bottom: 38 }}>
        <TechBlazerSignature size={22} />
      </div>
    </div>
  );
};

export default SplashScreen;