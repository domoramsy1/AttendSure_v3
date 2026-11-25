// AttendSure Web - Brand Assets Component
// File: D:\AttendSure_V3\web\src\components\branding\BrandAssets.tsx

/**
 * ATTENDSURE - Lightweight Brand & Theme-Safe Emblem Components
 * File: web/src/components/branding/BrandAssets.tsx
 */

import React, { useState } from 'react';
import attendsureLogoSvg from '../../assets/AttendSureLogo.svg';
import { SEAL_COLORS } from '../../theme/tokens';

export const BRAND_ASSETS = {
  attendsureLogo: attendsureLogoSvg,
} as const;

export interface AssetImageProps {
  size?: number;
  width?: number;
  height?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const AttendSureLogoAsset: React.FC<AssetImageProps> = ({
  size = 32,
  width,
  height,
  alt = 'AttendSure Logo',
  className,
  style,
}) => (
  <img
    src={attendsureLogoSvg}
    alt={alt}
    decoding="async"
    className={className}
    style={{
      width: width ?? size,
      height: height ?? size,
      objectFit: 'contain',
      display: 'block',
      ...style,
    }}
  />
);

export interface AttendSureBrandBadgeProps {
  size?: number;
  shape?: 'squircle' | 'circle';
  mode?: 'light' | 'dark' | 'high-contrast';
  style?: React.CSSProperties;
}

export const AttendSureBrandBadge: React.FC<AttendSureBrandBadgeProps> = ({
  size = 40,
  shape = 'squircle',
  mode = 'light',
  style,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const innerSize = Math.round(size * 0.58);
  const radius = shape === 'circle' ? '50%' : Math.max(8, Math.round(size * 0.27));

  const borderColor =
    mode === 'dark'
      ? 'rgba(56, 189, 248, 0.55)'
      : mode === 'high-contrast'
      ? SEAL_COLORS.navyDeep
      : SEAL_COLORS.border;

  const shadow =
    mode === 'dark'
      ? `0 4px 14px rgba(2, 132, 199, 0.28), inset 0 1px 0 ${SEAL_COLORS.white}`
      : mode === 'high-contrast'
      ? 'none'
      : `0 2px 8px rgba(0, 75, 135, 0.12), inset 0 1px 0 ${SEAL_COLORS.white}`;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(180deg, ${SEAL_COLORS.white} 0%, ${SEAL_COLORS.surface} 100%)`,
        borderWidth: mode === 'high-contrast' ? 1.5 : 1,
        borderStyle: 'solid',
        borderColor,
        boxShadow: shadow,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {!imgFailed ? (
        <img
          src={attendsureLogoSvg}
          alt="AttendSure"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{
            width: innerSize,
            height: innerSize,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      ) : (
        <svg viewBox="0 0 64 64" width={innerSize} height={innerSize} fill="none" aria-label="AttendSure">
          <path d="M32 8L12 52H22.5L32 30.5L41.5 52H52L32 8Z" fill={SEAL_COLORS.navy} />
          <rect x="14" y="42" width="36" height="10" rx="3" fill={SEAL_COLORS.sky} />
        </svg>
      )}
    </div>
  );
};
