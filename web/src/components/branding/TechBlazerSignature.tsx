// AttendSure Web - Tech Blazer Signature Component
// File: D:\AttendSure_V3\web\src\components\branding\TechBlazerSignature.tsx

/**
 * AttendSure - Pure-Vector Theme-Adaptive Developer Signature Badge
 * File: web/src/components/branding/TechBlazerSignature.tsx
 */

import React, { memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { sanitizeText, SEAL_COLORS } from '../../theme/tokens';

export interface TechBlazerSignatureProps {
  size?: number;
  textColor?: string;
  label?: string;
  layout?: 'stacked' | 'inline';
  className?: string;
  style?: React.CSSProperties;
}

const MIN_ICON_PX = 14;
const MAX_ICON_PX = 96;

const clampIconSize = (rawSize?: number): number => {
  const parsed = Number(rawSize);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(MAX_ICON_PX, Math.max(MIN_ICON_PX, Math.round(parsed)));
};

const isSafeCssColor = (value?: string): boolean => {
  if (!value || typeof value !== 'string') return false;
  const clean = value.trim();
  return (
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean) ||
    /^(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)$/.test(clean) ||
    /^var\(--[a-zA-Z0-9-_]+(?:\s*,\s*#[0-9a-fA-F]{3,8})?\)$/.test(clean)
  );
};

export const TechBlazerSignature: React.FC<TechBlazerSignatureProps> = memo(
  ({
    size = 20,
    textColor,
    label = 'from',
    layout = 'stacked',
    className = '',
    style,
  }) => {
    const { mode, tokens, fonts } = useTheme();

    const safeSize = clampIconSize(size);
    const tileSize = Math.round(safeSize * 1.35);
    const wordmarkFontPx = Math.max(11, Math.round(safeSize * 0.88));
    const safeLabel = sanitizeText(label, 24);
    const resolvedTextColor = isSafeCssColor(textColor) ? textColor!.trim() : tokens.textPrimary;

    const tileBorderColor =
      mode === 'dark'
        ? 'rgba(56, 189, 248, 0.45)'
        : mode === 'high-contrast'
        ? SEAL_COLORS.navyDeep
        : SEAL_COLORS.subtleBorder;

    return (
      <div
        className={className}
        aria-label={`${safeLabel ? `${safeLabel} ` : ''}TECHBLAZER`}
        style={{
          display: 'inline-flex',
          flexDirection: layout === 'inline' ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: layout === 'inline' ? 7 : 4,
          userSelect: 'none',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {safeLabel && (
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: '0.72rem',
              color: tokens.textMuted,
              letterSpacing: '0.04em',
              fontWeight: 600,
              textTransform: 'lowercase',
              lineHeight: 1.2,
            }}
          >
            {safeLabel}
          </span>
        )}

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <div
            style={{
              width: `${tileSize}px`,
              height: `${tileSize}px`,
              borderRadius: Math.max(6, Math.round(tileSize * 0.26)),
              background: `linear-gradient(180deg, ${SEAL_COLORS.white} 0%, ${SEAL_COLORS.surface} 100%)`,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: tileBorderColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={safeSize}
              height={safeSize}
              fill="none"
              aria-hidden="true"
            >
              <path d="M4 5.5H20V9H13.8V19H10.2V9H4V5.5Z" fill={SEAL_COLORS.navy} />
              <path d="M15.2 12.5L20 19H15.8L12.8 14.8L15.2 12.5Z" fill={SEAL_COLORS.sky} />
            </svg>
          </div>

          <span
            style={{
              fontFamily: fonts.display,
              fontSize: `${wordmarkFontPx}px`,
              fontWeight: 800,
              color: resolvedTextColor,
              letterSpacing: '0.10em',
              lineHeight: 1.1,
              transition: 'color 0.2s ease',
            }}
          >
            TECHBLAZER
          </span>
        </div>
      </div>
    );
  }
);

TechBlazerSignature.displayName = 'TechBlazerSignature';

export default TechBlazerSignature;
