import React from 'react';
import appLogoSrc from '../../assets/AppLogo.svg';

export interface AppLogoProps {
  size?: number;
  showText?: boolean;
  subtext?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 48,
  showText = true,
  subtext,
  className = '',
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size > 40 ? 12 : 8,
        ...style,
      }}
    >
      <img
        src={appLogoSrc}
        alt="AttendSure Logo"
        width={size}
        height={size}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          display: 'block',
          userSelect: 'none',
          flexShrink: 0,
        }}
      />

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: `${Math.round(size * 0.44)}px`,
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.5px',
              lineHeight: 1.1,
            }}
          >
            AttendSure
          </span>
          {subtext && (
            <span
              style={{
                fontSize: `${Math.round(size * 0.22)}px`,
                color: '#64748b',
                fontWeight: 500,
              }}
            >
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
};