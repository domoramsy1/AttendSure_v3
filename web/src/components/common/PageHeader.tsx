// AttendSure Web - Page Header Component
// File: D:\AttendSure_V3\web\src\components\common\PageHeader.tsx

/**
 * AttendSure - Standardized Module Page Header
 * File: web/src/components/common/PageHeader.tsx
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
}) => {
  const { tokens, brand, fonts } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '14px 18px',
        backgroundColor: tokens.bgSurface,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: tokens.borderSubtle,
        boxShadow: tokens.cardShadow,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {icon && (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: brand.primarySoft,
              color: brand.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: fonts.display,
                fontSize: fonts.size.lg,
                fontWeight: 800,
                color: tokens.textPrimary,
              }}
            >
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && (
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: fonts.size.sm,
                color: tokens.textSecondary,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
