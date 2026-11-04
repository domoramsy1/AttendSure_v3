/**
 * AttendSure - Reusable Telemetry Metric Card
 * Replaces duplicate statistic cards across Faculty, Gate Logs, and Classes tabs.
 * File: web/src/components/common/StatsCard.tsx
 */

import React from 'react';

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
  valueColor = 'var(--text-primary, #0f172a)',
  badge,
}) => {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface, #ffffff)',
        borderRadius: 12,
        border: '1px solid var(--border-subtle, #e2e8f0)',
        padding: '14px 16px',
        boxShadow: 'var(--card-shadow, 0 2px 6px rgba(0,0,0,0.03))',
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
            color: 'var(--text-secondary, #64748b)',
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
          color: valueColor,
          marginTop: 4,
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>

      <div style={{ fontSize: '0.70rem', color: 'var(--text-muted, #94a3b8)', marginTop: 3 }}>
        {helpText}
      </div>
    </div>
  );
};

export default StatsCard;