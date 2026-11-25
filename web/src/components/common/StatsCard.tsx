/**
 * AttendSure - Reusable Metric Summary Card
 * Replaces duplicate statistic cards across Teachers, Geofence, and Classes tabs.
 * File: web/src/components/common/StatsCard.tsx
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface StatsCardProps {
  label: string;
  value: string | number;
  helpText: string;
  valueColor?: string;
  badge?: React.ReactNode;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  label,
  value,
  helpText,
  valueColor,
  badge,
}) => {
  const { tokens } = useTheme();

  return (
    <div
      style={{
        backgroundColor: tokens.bgSurface,
        borderRadius: 12,
        border: `1px solid ${tokens.borderSubtle}`,
        padding: '14px 16px',
        boxShadow: tokens.cardShadow,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '0.64rem',
            fontWeight: 800,
            color: tokens.textSecondary,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        {badge}
      </div>

      <div
        style={{
          fontSize: '1.50rem',
          fontWeight: 900,
          color: valueColor || tokens.textPrimary,
          marginTop: 4,
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>

      <div style={{ fontSize: '0.70rem', color: tokens.textMuted, marginTop: 3 }}>
        {helpText}
      </div>
    </div>
  );
};

export default StatsCard;