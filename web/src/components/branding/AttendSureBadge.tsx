/**
 * AttendSure - Theme-Adaptive Brand Emblem Badge
 * File: web/src/components/branding/AttendSureBadge.tsx
 */

import React, { memo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { sanitizeText, SEAL_COLORS, type ThemeMode } from '../../theme/tokens';
import { BRAND_ASSETS } from './BrandAssets';

export interface AttendSureBadgeProps {
  size?: number;
  animate?: boolean;
  shape?: 'circle' | 'squircle';
  mode?: ThemeMode;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

const MIN_BADGE_PX = 16;
const MAX_BADGE_PX = 320;

const clampBadgeSize = (rawSize?: number): number => {
  const parsed = Number(rawSize);
  if (!Number.isFinite(parsed)) return 96;
  return Math.min(MAX_BADGE_PX, Math.max(MIN_BADGE_PX, Math.round(parsed)));
};

export const AttendSureBadge: React.FC<AttendSureBadgeProps> = memo(
  ({
    size = 96,
    animate = false,
    shape = 'circle',
    mode: overrideMode,
    alt = 'AttendSure',
    className,
    style,
  }) => {
    const { mode: contextMode } = useTheme();
    const [imageFailed, setImageFailed] = useState<boolean>(false);

    const activeMode = overrideMode || contextMode;
    const safeSize = clampBadgeSize(size);
    const iconSize = Math.round(safeSize * 0.62);
    const safeAlt = sanitizeText(alt, 60) || 'AttendSure';
    const radiusValue = shape === 'circle' ? '50%' : `${Math.max(8, Math.round(safeSize * 0.26))}px`;

    const borderColor =
      activeMode === 'dark'
        ? 'rgba(56, 189, 248, 0.55)'
        : activeMode === 'high-contrast'
        ? SEAL_COLORS.navyDeep
        : SEAL_COLORS.border;

    const badgeShadow =
      activeMode === 'dark'
        ? `0 8px 24px -4px rgba(2, 132, 199, 0.35), inset 0 1px 0 ${SEAL_COLORS.white}`
        : activeMode === 'high-contrast'
        ? `0 0 0 1.5px ${SEAL_COLORS.navyDeep}`
        : `0 8px 22px -4px rgba(0, 75, 135, 0.16), inset 0 1px 0 ${SEAL_COLORS.white}`;

    return (
      <div
        className={className}
        role="img"
        aria-label={safeAlt}
        style={{
          width: `${safeSize}px`,
          height: `${safeSize}px`,
          borderRadius: radiusValue,
          background: `linear-gradient(180deg, ${SEAL_COLORS.white} 0%, ${SEAL_COLORS.surface} 100%)`,
          borderWidth: activeMode === 'high-contrast' ? 2 : 1.5,
          borderStyle: 'solid',
          borderColor,
          boxShadow: badgeShadow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: animate ? 'attendsure-badge-pulse 2.6s ease-in-out infinite' : 'none',
          flexShrink: 0,
          userSelect: 'none',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {!imageFailed ? (
          <img
            src={BRAND_ASSETS.attendsureLogo}
            alt={safeAlt}
            width={iconSize}
            height={iconSize}
            decoding="async"
            draggable={false}
            onError={() => setImageFailed(true)}
            style={{
              width: `${iconSize}px`,
              height: `${iconSize}px`,
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <svg
            viewBox="0 0 64 64"
            width={iconSize}
            height={iconSize}
            fill="none"
            aria-hidden="true"
          >
            <path d="M32 8L12 52H22.5L32 30.5L41.5 52H52L32 8Z" fill={SEAL_COLORS.navy} />
            <rect x="14" y="42" width="36" height="10" rx="3" fill={SEAL_COLORS.sky} />
          </svg>
        )}

        {animate && (
          <style>{`
            @keyframes attendsure-badge-pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.035); }
            }
            @media (prefers-reduced-motion: reduce) {
              div[role="img"] { animation: none !important; }
            }
          `}</style>
        )}
      </div>
    );
  }
);

AttendSureBadge.displayName = 'AttendSureBadge';

export default AttendSureBadge;