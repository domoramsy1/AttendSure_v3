/**
 * AttendSure V3 - Responsive Institutional Telemetry Footer
 * File: web/src/components/layout/Footer.tsx
 */

import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { Building2, Database, Radio } from 'lucide-react';

export interface FooterProps {
  schoolName?: string;
  schoolId?: string;
  divisionOrCity?: string;
  isDatabaseConnected?: boolean;
  isGateSystemOnline?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  schoolName,
  schoolId,
  divisionOrCity,
  isDatabaseConnected = true,
  isGateSystemOnline = true,
}) => {
  const { school } = useSchool();
  const { tokens, brand } = useTheme();

  const activeSchoolName = schoolName || school.school_name || 'Lapasan National High School';
  const activeSchoolId = schoolId || school.school_id || '55555';
  const activeDivision = divisionOrCity || school.division || 'Cagayan de Oro City';

  return (
    <footer
      style={{
        height: 38,
        minHeight: 38,
        backgroundColor: tokens.bgSurface,
        borderTop: `1px solid ${tokens.borderSubtle}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.72rem',
        color: tokens.textSecondary,
        boxSizing: 'border-box',
        userSelect: 'none',
        flexWrap: 'wrap',
        gap: 8,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Left: Institutional Information */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <Building2 size={13} color={brand.primary} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {activeSchoolName}
        </span>
        <span style={{ color: tokens.borderSubtle }}>|</span>
        <span style={{ fontFamily: 'monospace', color: tokens.textMuted, flexShrink: 0 }}>
          ID: {activeSchoolId}
        </span>
        {activeDivision && (
          <span style={{ color: tokens.textMuted }}>
            | {activeDivision}
          </span>
        )}
      </div>

      {/* Right: Live Telemetry Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isDatabaseConnected ? brand.success : brand.danger, fontWeight: 700 }}>
          <Database size={11} />
          <span>{isDatabaseConnected ? 'Database Live' : 'Database Offline'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isGateSystemOnline ? brand.primary : brand.danger, fontWeight: 700 }}>
          <Radio size={11} />
          <span>{isGateSystemOnline ? 'Gate Live' : 'Gate Standby'}</span>
        </div>

        <span style={{ color: tokens.textMuted }}>&copy; 2026 AttendSure | TECHBLAZER</span>
      </div>
    </footer>
  );
};

export default Footer;