/**
 * AttendSure - Dynamic Institutional Footer (Zero Mock IDs)
 * File: web/src/components/layout/Footer.tsx
 */

import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { Building2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

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

  const activeSchoolName = schoolName?.trim() || school.school_name?.trim() || 'AttendSure School Portal';
  const activeSchoolId = schoolId?.trim() || school.school_id?.trim() || '—';
  const activeDivision = divisionOrCity?.trim() || school.division?.trim() || '';

  return (
    <footer
      style={{
        width: '100%',
        minHeight: 42,
        flexShrink: 0,
        backgroundColor: tokens.bgSurface,
        borderTop: `1px solid ${tokens.borderSubtle}`,
        padding: '8px clamp(12px, 2vw, 22px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px 18px',
        fontSize: '0.73rem',
        color: tokens.textSecondary,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={14} color={brand.primary} />
          <strong style={{ color: tokens.textPrimary }}>{activeSchoolName}</strong>
        </span>
        <span style={{ color: tokens.borderStrong }}>|</span>
        <span style={{ color: tokens.textMuted }}>School ID: {activeSchoolId}</span>
        {activeDivision && (
          <>
            <span style={{ color: tokens.borderStrong }}>|</span>
            <span style={{ color: tokens.textMuted }}>{activeDivision}</span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: isDatabaseConnected ? brand.success : brand.danger }}>
          {isDatabaseConnected ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {isDatabaseConnected ? 'Database Connected' : 'Server Offline'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: isGateSystemOnline ? brand.primary : brand.danger }}>
          <ShieldCheck size={13} />
          {isGateSystemOnline ? 'QR & Mobile Push Ready' : 'Standby'}
        </span>
        <span style={{ color: tokens.textMuted, fontSize: '0.68rem' }}>&copy; 2026 AttendSure &bull; TechBlazer</span>
      </div>
    </footer>
  );
};

export default Footer;